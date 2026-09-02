const spawn = require('cross-spawn')
const logProcess = require('./logProcess.js')
const languagePathSegment = require('../paths/languagePathSegment.js')

// Run HTML transformations on elements in epubs
async function epubHTMLTransformations (argv) {
  console.log('Running epub HTML transformations ...')

  try {
    let epubHTMLTransformationsProcess
    if (languagePathSegment(argv)) {
      epubHTMLTransformationsProcess = spawn(
        'gulp',
        ['runEpubTransformations',
          '--book', argv.book,
          '--language', argv.language]
      )
    } else {
      epubHTMLTransformationsProcess = spawn(
        'gulp',
        ['runEpubTransformations', '--book', argv.book]
      )
    }
    await logProcess(epubHTMLTransformationsProcess, 'Run epub HTML transformations')
    return true
  } catch (error) {
    console.log(error)
  }
}

module.exports = epubHTMLTransformations
