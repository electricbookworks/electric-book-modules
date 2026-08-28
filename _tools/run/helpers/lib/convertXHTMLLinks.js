const spawn = require('cross-spawn')
const logProcess = require('./logProcess.js')
const languagePathSegment = require('../paths/languagePathSegment.js')

// Converts paths in links from *.html to *.xhtml
async function convertXHTMLLinks (argv) {
  console.log('Converting links from .html to .xhtml ...')

  try {
    let convertXHTMLLinksProcess
    if (languagePathSegment(argv)) {
      convertXHTMLLinksProcess = spawn(
        'gulp',
        ['epubXhtmlLinks',
          '--book', argv.book,
          '--language', argv.language]
      )
    } else {
      convertXHTMLLinksProcess = spawn(
        'gulp',
        ['epubXhtmlLinks', '--book', argv.book]
      )
    }
    await logProcess(convertXHTMLLinksProcess, 'XHTML links')
    return true
  } catch (error) {
    console.log(error)
  }
}

module.exports = convertXHTMLLinks
