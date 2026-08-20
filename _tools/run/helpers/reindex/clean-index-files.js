const fs = require('fs')
const fsPath = require('path')
const fsPromises = require('fs/promises')

// All supported output formats.
const outputFormats = ['print-pdf', 'screen-pdf', 'web', 'epub', 'app']

// Escape a string for safe use inside a RegExp.
function escapeForRegExp (string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// A single RegExp matching every valid index filename across all
// output formats. Anything in _indexes that doesn't match is stale.
function validIndexFilePattern () {
  const formatGroup = '(?:' +
    outputFormats.map(escapeForRegExp).join('|') + ')'
  return new RegExp(
    '^(?:' +
    'search-index-' + formatGroup + '|' + // search index
    'search-index-with-docs-' + formatGroup + '|' + // search index with docs
    formatGroup + '-.+-index' + // per-book reference index
    ')\\.js$'
  )
}

// Remove any files in _indexes that aren't valid index output files
// for any format. This clears out legacy and stray files.
async function cleanIndexFiles () {
  const indexesDir = fsPath.normalize(process.cwd() + '/_indexes')
  if (!fs.existsSync(indexesDir)) {
    return
  }

  const pattern = validIndexFilePattern()
  const entries = await fsPromises.readdir(indexesDir, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.isFile() && !pattern.test(entry.name)) {
      await fsPromises.unlink(fsPath.normalize(indexesDir + '/' + entry.name))
      console.log('Removing stale index file ' + entry.name)
    }
  }
}

module.exports = cleanIndexFiles
