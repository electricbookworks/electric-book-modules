const spawn = require('cross-spawn')
const logProcess = require('./logProcess.js')
const languagePathSegment = require('../paths/languagePathSegment.js')

// Converts .html files to .xhtml, e.g. for epub output
async function convertXHTMLFiles (argv) {
  console.log('Renaming files from .html to .xhtml ...')

  try {
    let convertXHTMLFilesProcess
    if (languagePathSegment(argv)) {
      convertXHTMLFilesProcess = spawn(
        'gulp',
        ['epubXhtmlFiles',
          '--book', argv.book,
          '--language', argv.language]
      )
    } else {
      convertXHTMLFilesProcess = spawn(
        'gulp',
        ['epubXhtmlFiles', '--book', argv.book]
      )
    }
    await logProcess(convertXHTMLFilesProcess, 'XHTML files')
    return true
  } catch (error) {
    console.log(error)
  }
}

module.exports = convertXHTMLFiles
