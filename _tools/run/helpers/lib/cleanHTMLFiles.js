const spawn = require('cross-spawn')
const logProcess = require('./logProcess.js')
const languagePathSegment = require('../paths/languagePathSegment.js')

// Cleans out old .html files after .xhtml conversions
async function cleanHTMLFiles (argv) {
  console.log('Cleaning out old .html files ...')

  try {
    let cleanHTMLFilesProcess
    if (languagePathSegment(argv)) {
      cleanHTMLFilesProcess = spawn(
        'gulp',
        ['epubCleanHtmlFiles',
          '--book', argv.book,
          '--language', argv.language]
      )
    } else {
      cleanHTMLFilesProcess = spawn(
        'gulp',
        ['epubCleanHtmlFiles', '--book', argv.book]
      )
    }
    await logProcess(cleanHTMLFilesProcess, 'Clean HTML files')
    return true
  } catch (error) {
    console.log(error)
  }
}

module.exports = cleanHTMLFiles
