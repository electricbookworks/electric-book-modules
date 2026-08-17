const cheerio = require('cheerio')
const fs = require('fs')
const fsPath = require('path')
const fsPromises = require('fs/promises')
const fsExtra = require('fs-extra')
const cleanIndexFiles = require('./clean-index-files.js')
const toStandardJsLiteral = require('./js-literal.js')

// This function writes a single file for the content API
async function writeContentAPIFile (pageObject) {
  // Create an index.json path from the page's URL
  const contentFileRelativePath = pageObject.path.replace(/\.html$/, '/index.json')

  // Create an absolute path to write to
  const contentFileAbsolutePath = fsPath.normalize(process.cwd() +
      '/_api/content/' + contentFileRelativePath)

  // Write the file (fsExtra.outputFile will create
  // the path and file if they don't exist)
  try {
    await fsExtra.outputFile(contentFileAbsolutePath, JSON.stringify(pageObject))
  } catch (err) {
    console.error(err)
  }
}

// Returns whether to generate the content API
// - check config for api collection
// - only output on web format
function generateContentAPI (outputFormat, configsObject) {
  if (outputFormat === 'web' &&
    configsObject?.collections?.docs?.output === true) {
    return true
  } else {
    return false
  }
}

// The main process for generating a search index
async function buildSearchIndex (outputFormat, filesData, configsObject) {
  // These hold the elasticlunr index page objects.
  // One set includes /docs pages, the other excludes them.
  const storeNoDocs = []
  const storeWithDocs = []

  // Are we generating the API?
  const api = generateContentAPI(outputFormat, configsObject)

  // This will be an index for API access.
  // It will not include any /docs
  const contentIndexForAPI = []

  // If we are building API content,
  // remove existing the api/content so that
  // we can completely refresh it.
  if (api) {
    await fsExtra.emptyDir(fsPath.normalize(process.cwd() + '/_api/content'))
  }

  let i
  let count = 0
  for (i = 0; i < filesData.length; i += 1) {
    // Make the URL path absolute, because
    // we might be indexing file system files,
    // not web-served pages. Assume this script
    // is run from the repo root, e.g as
    // node _site/assets/js/render-search-index.js
    // in which case the repo root is the current working directory (cwd).
    // Note we do not normalise here, because we want
    // the path to use forward slashes even on Windows,
    // so we can check the string later on.
    const path = process.cwd() + '/_site/' + filesData[i].path

    // Check that the page exists before we
    // try to open it
    let pageExists = false
    if (fs.existsSync(fsPath.normalize(path))) {
      pageExists = true
    }

    // User feedback.
    // We can normalise the path here for readability.
    if (pageExists) {
      console.log('Indexing ' + fsPath.normalize(path) + ' for search index.')
    } else {
      console.log(fsPath.normalize(path) + ' is listed for indexing, but can\'t be found.')
      count += 1
      continue
    }

    // Read and parse the page's HTML
    const html = await fsPromises.readFile(fsPath.normalize(path), 'utf8')
    const $ = cheerio.load(html)

    // Get the page title
    let title = ''
    const titleText = $('title').text()
    if (titleText) {
      title = titleText.replace(/"/g, '\'').replace(/\s+/g, ' ').trim()
    }

    // Get the page description
    let description = ''
    const descriptionContent = $('meta[name="description"]').attr('content')
    if (descriptionContent) {
      description = descriptionContent.replace(/"/g, '\'').replace(/\s+/g, ' ').trim()
    }

    // Get the page content
    let content = ''
    const contentDiv = $('body .content')
    if (contentDiv.length > 0) {
      content = contentDiv.text().replace(/"/g, '\'').replace(/\s+/g, ' ').trim()
    }

    // Build the API endpoint
    const endpoint = 'api/content/' +
      filesData[i].path.replace(/\.html$/, '/index.json')

    // Create an object for this page.
    // We create two versions: one without content
    // for the overall index, and with with content
    // for the per-page JSON file.
    // For title and content, we strip out backslashes
    // to avoid invalid unicode escape sequences.
    // E.g. at MathJax you can get \\uparrow,
    // where \u will throw a JS exception.
    let pageObjectForAPIIndex = {
      id: count,
      path: filesData[i].path,
      title: title.replace(/\\/g, ''),
      description,
      json: endpoint
    }
    let pageObjectForAPIContent = {
      id: count,
      path: filesData[i].path,
      title: title.replace(/\\/g, ''),
      description,
      content: content.replace(/\\/g, '')
    }

    // Write the index entry object.
    // We want this for each page:
    // {
    //   id: n,
    //   title: "Title of page",
    //   content: "Content of page",
    // }
    // Add entry to the with-docs store.
    storeWithDocs.push(pageObjectForAPIContent)

    // If this page isn't a doc, include it
    // in the no-docs search index and the API index,
    // and write a single-page content file for it.
    // Note this check is why we don't normalise the path
    // above, since it would have backslashes on Windows
    // if the path had been normalised.
    if (!path.includes('/_site/docs/')) {
      storeNoDocs.push(pageObjectForAPIContent)

      if (api) {
        contentIndexForAPI.push(pageObjectForAPIIndex)
        writeContentAPIFile(pageObjectForAPIContent)
      }
    }

    // Increment counter
    count += 1

    // Reset the pageObjects
    pageObjectForAPIIndex = {}
    pageObjectForAPIContent = {}
  }

  // Build the store file contents.
  // The data is written as a Standard-style JS literal so the files
  // are human-readable and pass linting; webpack minifies them later.
  function buildStoreFile (store) {
    return 'const store = ' + toStandardJsLiteral(store) + '\n\n' +
        'if (store) { module.exports = store }\n'
  }

  // Work out the search-index file paths and names.
  const fileNameNoDocs = 'search-index-' + outputFormat + '.js'
  const fileNameWithDocs = 'search-index-with-docs-' + outputFormat + '.js'
  const indexFilePathNoDocs = fsPath.normalize(process.cwd() +
      '/_indexes/' + fileNameNoDocs)
  const indexFilePathWithDocs = fsPath.normalize(process.cwd() +
      '/_indexes/' + fileNameWithDocs)
  const indexFilePathForAPI = fsPath.normalize(process.cwd() +
      '/_api/content/index.json')

  // Write the search index files.
  // fsExtra.outputFile creates the path and file if they don't exist.
  await fsExtra.outputFile(indexFilePathWithDocs, buildStoreFile(storeWithDocs))
  console.log('Writing ' + indexFilePathWithDocs)

  await fsExtra.outputFile(indexFilePathNoDocs, buildStoreFile(storeNoDocs))
  console.log('Writing ' + indexFilePathNoDocs)

  // Write the API index file.
  // Note: contentIndexForAPI is an object and must be stringified.
  if (api) {
    await fsExtra.outputFile(indexFilePathForAPI, JSON.stringify(contentIndexForAPI))
    console.log('Writing ' + indexFilePathForAPI)
  }

  // Remove any stale or legacy index files that don't match the
  // current output naming patterns for any format.
  await cleanIndexFiles()

  console.log('Done.')
}

// Run the rendering process
module.exports = buildSearchIndex
