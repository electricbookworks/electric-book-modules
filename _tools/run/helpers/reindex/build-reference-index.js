const cheerio = require('cheerio')
const fs = require('fs')
const fsPath = require('path')
const fsPromises = require('fs/promises')
const { decode } = require('entities')
const { marked } = require('marked')
const ebSlugify = require('../../../utilities/slugify')
const cleanIndexFiles = require('./clean-index-files.js')
const toStandardJsLiteral = require('./js-literal.js')

// A cheerio equivalent of ebDecodeHtmlEntitiesPreservingTags
// from assets/js/utilities.js
function decodeHtmlEntitiesPreservingTags (html) {
  // Load as a fragment (not a full document)
  const $ = cheerio.load(html, null, false)

  function decodeTextNodes (el) {
    $(el).contents().each((_, node) => {
      if (node.type === 'text') {
        node.data = decode(node.data)
      } else if (node.type === 'tag') {
        decodeTextNodes(node)
      }
    })
  }

  decodeTextNodes($.root())

  return $.root().html()
}

// Turn HTML comments for book indexes into anchor tags.
// In web output, index targets are added dynamically in the browser
// by assets/js/index-targets.js, so they are not present in the static
// HTML we read here. This replicates that process server-side so we can
// scrape the targets without a headless browser. It mirrors
// renderIndexCommentsAsTargets in _tools/gulp/processors/indexes.js,
// so if you update one you may need to update the others.
function renderIndexCommentsAsTargets ($) {
  // If the targets have already been baked in (e.g. by the gulp
  // pre-processing used for PDF and epub), there's nothing to do.
  if ($('body').attr('data-index-targets') === 'loaded') {
    return
  }

  // Create an empty array to store entries.
  const entries = []

  $('*').contents()
    // Return only comment nodes...
    .filter(function () {
      return this.nodeType === 8
    })
    // .. that start with `index:`
    .filter(function () {
      return (/^\s*index:/).test(this.data)
    })
    .each(function (unusedIndex, comment) {
      // Is this comment between elements ('block')
      // or inline (e.g. inside a paragraph)?
      const startsWithLinebreak = /^\n/
      let position
      if (comment.prev &&
          comment.next &&
          startsWithLinebreak.test(comment.prev.data) &&
          startsWithLinebreak.test(comment.next.data)) {
        position = 'block'
      } else {
        position = 'inline'
      }

      // Split the lines into an array.
      const commentText = this.data
      const commentLines = commentText.split('\n')

      // Process each line, i.e. each index target in the comment.
      commentLines.forEach(function (line) {
        // Remove the opening 'index:' prefix.
        const indexKeywordRegex = /^\s*index:/
        if (indexKeywordRegex.test(line)) {
          line = line.replace(indexKeywordRegex, '')
        }

        // Strip white space at start and end of line.
        line = line.trim()

        // Exit if the stripped line is now empty.
        // We only want to process actual book-index terms.
        if (line === '') {
          return
        }

        // Split the line into its entry components.
        // It might be a nested entry, where each level
        // of nesting appears after double backslashes.
        // e.g. software \\ book-production
        const rawEntriesByLevel = line.split('\\')

        // Trim whitespace from each entry
        // https://stackoverflow.com/a/41183617/1781075
        // and remove any leading or trailing tildes.
        const entriesByLevel = rawEntriesByLevel.map(function (str) {
          return str.trim().replace(/^~+|~+$/, '')
        })

        // Check for starting or ending tildes.
        // If one exists, flag the target as `from` or `to`,
        // starting or ending a reference range. Then strip the tildes.
        let rangeClass = 'index-target-specific'

        if (line.substring(0, 1) === '~') {
          rangeClass = 'index-target-to'
          line = line.substring(1)
        } else if (line.substring(line.length - 1) === '~') {
          rangeClass = 'index-target-from'
          line = line.substring(0, line.length - 1)
        }

        // Slugify the target text to use in an ID
        // and to check for duplicate instances later.
        // We process the text as markdown, because we need
        // HTML tag content included, as it is for listItemSlug.
        // But we remove HTML entities before slugifying.
        const processedLine = decodeHtmlEntitiesPreservingTags(marked.parseInline(line))
        const entrySlug = ebSlugify(processedLine, true)

        // Add the slug to the array of entries,
        // where will we count occurrences of this entry.
        entries.push(entrySlug)

        // Create an object that counts occurrences
        // of this entry on the page so far.
        const entryOccurrences = entries.reduce(function (allEntries, entry) {
          if (entry in allEntries) {
            allEntries[entry] += 1
          } else {
            allEntries[entry] = 1
          }
          return allEntries
        }, {})

        // Get the number of occurrences of this entry so far.
        const occurrencesSoFar = entryOccurrences[entrySlug]

        // Use that to add a unique index-ID suffix to the entry slug.
        const id = entrySlug + '--iid-' + occurrencesSoFar

        // Create an anchor tag for each line.
        // Note: this tag contains a zero-width space, so that it
        // actually appears in Prince, which doesn't render empty elements.
        const newAnchorElement = $('<a>​</a>')
          .addClass('index-target')
          .addClass(rangeClass)
          .attr('data-target-type', position)
          .attr('id', id)
          .attr('data-index-markup', line)
          .attr('data-index-entry', entriesByLevel.slice(-1).pop())
          .attr('style', 'position: absolute')

        newAnchorElement.insertAfter(comment)
      })
    })

  // If the comment was between blocks, it has `data-target-type=block`.
  // So the anchor targets need to move inside the following block.
  // We get the next element that is not an .index-target
  // then prepend the link to it.
  $('[data-target-type=block]').each(function (unusedIndex, link) {
    link = $(link) // wrap it for cheerio
    const indexedElement = $(link).nextAll(':not(.index-target)').first()
    indexedElement.prepend(link)
  })

  // Finally, flag that we're done.
  $('body').attr('data-index-targets', 'loaded')
}

// Work out the reference-index filename for a book/language group.
// Book index targets are split per book and per language, so the
// generated files are smaller and more performant. Targets that don't
// belong to a book fall back to the global filename.
function referenceIndexFileName (book, language, outputFormat) {
  if (!book) {
    return 'book-index-' + outputFormat + '.js'
  }

  // Omit the language segment for the default language.
  const languageSegment = language ? '-' + language : ''
  return outputFormat + '-' + book + languageSegment + '-index.js'
}

// The main process for generating an index of targets.
async function buildReferenceIndex (outputFormat, filesData) {
  // Group the book-index targets by book and language. Each group is
  // a 'database' of the targets for one book/language combination.
  // Files that don't belong to a book fall back to a global group.
  const groups = new Map()

  function getGroup (book, language) {
    const key = book ? book + '|' + (language || '') : '__global__'
    if (!groups.has(key)) {
      groups.set(key, {
        book: book || '',
        language: language || '',
        pages: []
      })
    }
    return groups.get(key)
  }

  let i
  for (i = 0; i < filesData.length; i += 1) {
    const path = fsPath.normalize(process.cwd() + '/_site/' + filesData[i].path)

    // Get the filename.
    // Note we don't use the full normalized path, because
    // on Windows that would need to split on \ not /.
    const filename = filesData[i].path.split('/').pop()

    // Check that the page exists before we
    // try to open it
    if (!fs.existsSync(fsPath.normalize(path))) {
      console.log(fsPath.normalize(path) + ' is listed for the reference index, but can\'t be found.')
      continue
    }

    // User feedback.
    // We can normalise the path here for readability.
    console.log('Indexing ' + fsPath.normalize(path) + ' for reference index.')

    // Read and parse the page's HTML.
    // Use XML mode for epub, matching the gulp index pre-processing.
    const html = await fsPromises.readFile(fsPath.normalize(path), 'utf8')
    const $ = cheerio.load(html, { xmlMode: outputFormat === 'epub' })

    // Add the index targets to the DOM. In web output these are added
    // dynamically in the browser, so they aren't in the static HTML.
    // For PDF and epub they're already baked in, so this is a no-op.
    renderIndexCommentsAsTargets($)

    // Check if the page has any index targets.
    if ($('.index-target').length === 0) {
      console.log('No index targets found for ' + filename + ', skipping.')
      continue
    }

    // Collect the index targets on this page.
    // Note that we do not sort the entries. The items are added in
    // order of appearance in the DOM, even if their ID numbers don't
    // run in order. Their array order should match the order they're
    // used for page references at each entry in the book index.
    const indexEntries = []
    $('.index-target').each(function (i, element) {
      const entry = $(element)

      // Check if this target starts or ends a reference range
      let range = ''
      if (entry.hasClass('index-target-from')) {
        range = 'from'
      }
      if (entry.hasClass('index-target-to')) {
        range = 'to'
      }

      // Get the entry's nesting as an array.
      // It might be a nested entry, where each level
      // of nesting appears after double back slashes \\.
      // e.g. software \\ book-production
      const rawEntriesByLevel = entry.attr('data-index-markup').split('\\')

      // Trim whitespace from each entry
      // https://stackoverflow.com/a/41183617/1781075
      const entriesByLevel = rawEntriesByLevel.map(str => str.trim())

      // We want this for each entry on each page:
      // {
      //   entrySlug: 'entry-text'
      //   entryText: 'Entry Text',
      //   filename: 'filename.html',
      //   id: '#entry-text--iid-1',
      //   path: samples/filename.html
      // }
      const id = entry.attr('id')

      indexEntries.push({
        entrySlug: id.split('--iid-')[0],
        entryText: entry.attr('data-index-entry'),
        entryTree: JSON.stringify(entriesByLevel),
        id,
        range,
        filename
      })
    })

    // Add the entries to the group for this file's book and language,
    // if there are any.
    if (indexEntries.length > 0) {
      getGroup(filesData[i].book, filesData[i].language).pages.push(indexEntries)
    }
  }

  // Ensure the _indexes directory exists.
  const indexesDir = fsPath.normalize(process.cwd() + '/_indexes')
  if (!fs.existsSync(indexesDir)) {
    fs.mkdirSync(indexesDir, { recursive: true })
  }

  // Write a book index 'database' file for each book/language group.
  // We add module.exports so that we can use indexTargets
  // in Node processes (i.e. gulp with cheerio)
  // and in other JS modules.
  // The data is written as a Standard-style JS literal so the files
  // are human-readable and pass linting; webpack minifies them later.
  for (const group of groups.values()) {
    const fileName = referenceIndexFileName(group.book, group.language, outputFormat)
    const indexFilePath = fsPath.normalize(indexesDir + '/' + fileName)
    const fileContents = 'const ebIndexTargets = ' +
        toStandardJsLiteral(group.pages) + '\n\n' +
        'module.exports = ebIndexTargets\n'

    await fsPromises.writeFile(indexFilePath, fileContents)
    console.log('Writing ' + indexFilePath)
  }

  // Remove any stale or legacy index files that don't match the
  // current output naming patterns for any format.
  await cleanIndexFiles()

  console.log('Done.')
}

// Run the rendering process.
module.exports = buildReferenceIndex
