// Lint with JS Standard

// Import Node modules
const jsdom = require('jsdom')
const { JSDOM } = jsdom
const fs = require('fs-extra')
const fsPath = require('path')
const fsPromises = require('fs/promises')

// Local helpers
const htmlFilePaths = require('../paths/htmlFilePaths.js')

// HTML5 ignores the self-closing slash on non-void elements such as
// `<script src="..."/>` or `<iframe .../>`. When the HTML parser meets
// one of these, the element stays open and every subsequent piece of
// markup (including the <body> and its `.wrapper`) is consumed as the
// element's raw text content. The result is an empty <body>, a missing
// `.wrapper`, and `mergedBody.append(null)` writing the literal string
// "null" once per merged file. We normalise these XHTML-style tags into
// explicit open/close pairs before parsing so JSDOM builds the DOM
// correctly.
function normaliseSelfClosingTags (html) {
  const nonVoidElements = [
    'script', 'iframe', 'textarea', 'title', 'style', 'noscript'
  ]
  const pattern = new RegExp(
    '<(' + nonVoidElements.join('|') + ')\\b([^>]*?)\\s*/>',
    'gi'
  )
  return html.replace(pattern, '<$1$2></$1>')
}

// Make IDs in HTML unique by prefixing them
// with the slug of the filename, and updating
// any links that point to them.
function updateIDs (filename, dom, argv) {
  return new Promise(function (resolve, reject) {
    try {
      // Prefix IDs with a no-spaces, no-fullstops filename
      const prefix = filename.replace(/[.\s]/g, '-')
      const elementsWithIDs = dom.window.document.querySelectorAll('[id]')

      elementsWithIDs.forEach(function (el) {
        el.id = prefix + '-' + el.id
      })

      // To update links, we will:
      // - Give the .content an ID, created from the filename
      // - Remove filenames and add # IDs to links without them
      // - Update targets to include filename-slug prefixes

      // Give the .content element an ID from the filename,
      // so that we can point links to this file to that ID instead.
      const contentElement = dom.window.document.querySelector('.content')
      if (contentElement) {
        contentElement.id = prefix
      }

      // Get all links
      const links = dom.window.document.querySelectorAll('a[href]')

      // Convert the Nodelist to an array for filtering
      if (links) {
        const linksArray = Array.from(links)

        // Filter out the external links, if there are links
        let internalLinks
        if (linksArray.length > 0) {
          internalLinks = linksArray.filter(function (link) {
            let isInternal = true
            if (link.href.startsWith('https://') ||
                link.href.startsWith('http://')) {
              isInternal = false
            }
            return isInternal
          })
        }

        if (internalLinks) {
          internalLinks.forEach(function (link) {
            let href = link.getAttribute('href')

            // Initialise variables for the target filename and ID
            let linkFilenameAsPrefix
            let linkID

            // If an href contains slashes, it includes a path,
            // potentially to another book in this project.
            // If it's in the same book, we can simply remove the path
            // and only keep the filename.
            // If it's to another book, we must leave the link as is,
            // and set a flag that prevents us from changing it later.
            let hrefIsToThisBook = true
            if (href.match(/\//)) {
              const hrefAsArray = href.replace(/^\.\.\//, '').split('/')
              if (hrefAsArray[0] === argv.book) {
                href = hrefAsArray.pop()
              } else {
                hrefIsToThisBook = false
              }
            }

            // If the href:
            // - is internal to this book, and
            // - contains text and #, it points to a file and an ID
            // - starts with #, it points to an ID in this file
            // - doesn't include #, it points to another file.
            if (hrefIsToThisBook) {
              if (href.match(/.+#/)) {
                linkFilenameAsPrefix = href.split('#').shift()
                  .replace(/[.\s]/g, '-')
                linkID = href.split('#').pop()
              } else if (href.startsWith('#')) {
                linkFilenameAsPrefix = prefix
                linkID = href.split('#').pop()
              } else {
                linkFilenameAsPrefix = href.replace(/[.\s]/g, '-')
              }

              // Change the link to an internal link that uses
              // the new ID prefix plus the linkID, if any.
              link.href = '#' + linkFilenameAsPrefix
              if (linkID) {
                link.href = '#' + [linkFilenameAsPrefix, linkID].join('-')
              }
            }
          })
        }
      }

      resolve(dom)
    } catch (error) {
      console.log(error)
      reject(error)
    }
  })
}

// Merge source HTML files into a single file
async function merge (argv) {
  // Don't merge files if --merged has not
  // been passed at the command line
  if (argv.merged === false) {
    return
  }

  console.log('Merging HTML files ...')
  const filePaths = await htmlFilePaths(argv)

  let destination
  if (argv.language) {
    destination = fsPath.normalize(process.cwd() +
      '/_site/' + argv.book + '/' + argv.language + '/merged.html')
  } else {
    destination = fsPath.normalize(process.cwd() +
      '/_site/' + argv.book + '/merged.html')
  }

  let mergedDom

  // Process files sequentially so that ordering, the merged DOM and the
  // serialized output are deterministic. (A previous `forEach(async ...)`
  // loop relied on microtask ordering and resolved before the file had
  // finished writing.)
  for (let i = 0; i < filePaths.length; i += 1) {
    const filePath = filePaths[i]

    // Read and normalise the HTML before parsing it.
    const html = normaliseSelfClosingTags(fs.readFileSync(filePath, 'utf8'))
    let dom = new JSDOM(html)

    // Update the IDs and links
    const filename = fsPath.basename(filePath)
    dom = await updateIDs(filename, dom, argv)

    if (i === 0) {
      // Use the first file as our base, to which we append the rest.
      mergedDom = dom
    } else {
      // For later files we only want the .wrapper,
      // appended to the base file's body element.
      const newContent = dom.window.document.querySelector('.wrapper')
      const mergedBody = mergedDom.window.document.querySelector('body')

      if (newContent && mergedBody) {
        mergedBody.append(newContent)
      } else {
        console.log('Warning: no .wrapper found in ' + filename +
          ', so it was skipped in the merged HTML.')
      }
    }

    // Remove the main bundle script tag from all but the last file,
    // so it doesn't load multiple times.
    if (i < filePaths.length - 1) {
      const bundleScriptTag = mergedDom.window.document
        .querySelector('[data-script-name="main"]')
      if (bundleScriptTag) {
        bundleScriptTag.remove()
      }
    }
  }

  console.log('Writing merged HTML to ' + destination)
  await fsPromises.writeFile(destination, mergedDom.serialize())
  return true
}

module.exports = merge
