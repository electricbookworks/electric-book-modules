// Lint with JS Standard

// Import modules
const fs = require('fs')
const yaml = require('js-yaml')
const { book, language, format } = require('./args.js')

// Load scripts from elsewhere in this repo
const pathToJsAssetsSrc = `${process.cwd()}/_indexes/`

// Work out the reference-index filename for the current book, language
// and output format. Book-index 'databases' are split per book and per
// language, so this must match referenceIndexFileName() in
// _tools/run/helpers/reindex/build-reference-index.js.
function referenceIndexFileName (book, language, outputFormat) {
  // args.js prefixes a non-default language with a slash (e.g. '/fr'),
  // so strip it before building the filename segment.
  const languageName = language.replace(/^\//, '')
  const languageSegment = languageName ? '-' + languageName : ''
  if (!book) {
    return outputFormat + '-book' + languageSegment + '-index.js'
  }
  return outputFormat + '-' + book + languageSegment + '-index.js'
}

// Load the book-index 'database' for the current book/language/format.
// We only require the file if it exists, so that loading this module
// doesn't create empty placeholder files for formats that aren't
// being built (e.g. building web shouldn't touch the PDF/epub/app
// index files). Missing files default to an empty array.
function loadIndexTargets () {
  const indexFilePath = pathToJsAssetsSrc + referenceIndexFileName(book, language, format)
  if (fs.existsSync(indexFilePath)) {
    try {
      return require(indexFilePath)
    } catch (error) {
      console.log(error)
      console.log(`Could not load ${indexFilePath}.`)
      console.log('This is fine if you are only processing images.')
    }
  }
  return []
}

const indexTargets = loadIndexTargets()

// Load image settings if they exist
let imageSettings = []
if (fs.existsSync('_data/images.yml')) {
  imageSettings = yaml.load(fs.readFileSync('_data/images.yml', 'utf8'))

  // If the file is empty, imageSettings will be null.
  // So we check for that and, if null, we create an array.
  if (!imageSettings) {
    imageSettings = []
  }
}

// Set up paths.
// Paths to text src must include the *.html extension.
// Add paths to any JS files to minify to the src array, e.g.
// src: ['assets/js/foo.js,assets/js/bar.js'],
const paths = {
  img: {
    source: book + language + '/images/_source/',
    printpdf: book + language + '/images/print-pdf/',
    web: book + language + '/images/web/',
    screenpdf: book + language + '/images/screen-pdf/',
    epub: book + language + '/images/epub/',
    app: book + language + '/images/app/'
  },
  text: {
    src: '_site/' + book + language + '/*.html',
    merged: ['_site/' + book + language + '/merged.html'],
    dest: '_site/' + book + language + '/'
  },
  epub: {
    src: '_site/' + book + language + '/*.html',
    dest: '_site/' + book + language + '/'
  },
  js: {
    src: [],
    dest: 'assets/js/'
  },
  yaml: {
    src: ['*.yml', '_configs/*.yml', '_configs/**/*.yml', '_data/*.yml', '_data/**/*.yml']
  },
  // Arrays of globs to ignore from tasks
  ignore: {
    printpdf: ['**/favicon.*'],
    web: [],
    screenpdf: ['**/favicon.*'],
    epub: ['**/favicon.*'],
    app: ['**/favicon.*']
  }
}

exports.indexTargets = indexTargets
exports.imageSettings = imageSettings
exports.paths = paths
