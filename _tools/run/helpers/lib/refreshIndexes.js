const fs = require('fs-extra')
const buildReferenceIndex = require('../reindex/build-reference-index.js')
const buildSearchIndex = require('../reindex/build-search-index.js')
const webpack = require('./webpack.js')
const jekyll = require('./jekyll.js')
const renderMathjax = require('./renderMathjax.js')
const renderIndexComments = require('./renderIndexComments.js')
const allFilesListed = require('./allFilesListed.js')
const projectSettings = require('./projectSettings.js')
const configsObject = require('./configsObject.js')

// Refresh indexes
async function refreshIndexes (argv) {
  try {
    /*
    Much of _tools doesn't properly cater for the baseurl.
    The assumption in most methods is that baseurl is ''.
    Setting baseurl here is a temporary/safe fix to avoid further regressions for now.
    */
    const _argv = {
      ...argv,
      baseurl: ''
    }
    if (!_argv.skipbuild) {
      await fs.emptyDir(process.cwd() + '/_site')
      await webpack(_argv)
      await jekyll(_argv)
    }
    if (argv.format === 'print-pdf' ||
      argv.format === 'screen-pdf' ||
      argv.format === 'epub') {
      await renderMathjax(_argv, { allFiles: true })
      await renderIndexComments(_argv, { allFiles: true })
    }

    const filesForIndexing = await allFilesListed(_argv, { check: true })
    if (projectSettings()['dynamic-indexing'] !== false) {
      buildReferenceIndex(argv.format, filesForIndexing)
    }

    if (argv.format === 'web' ||
      argv.format === 'app') {
      buildSearchIndex(argv.format, filesForIndexing, configsObject())
    }
  } catch (error) {
    console.log(error)
  }
}

module.exports = refreshIndexes
