const spawn = require('cross-spawn')
const logProcess = require('./logProcess.js')
const projectSettings = require('./projectSettings.js')
const languagePathSegment = require('../paths/languagePathSegment.js')

// Processes index-list items as linked references in output HTML
async function renderIndexLinks (argv) {
  if (projectSettings()['dynamic-indexing'] !== false) {
    console.log('Adding links to reference indexes ...')

    try {
      let indexLinksProcess
      if (languagePathSegment(argv)) {
        indexLinksProcess = spawn(
          'gulp',
          ['renderIndexListReferences',
            '--book', argv.book,
            '--language', argv.language,
            '--format', argv.format]
        )
      } else {
        indexLinksProcess = spawn(
          'gulp',
          ['renderIndexListReferences',
            '--book', argv.book,
            '--format', argv.format]
        )
      }
      await logProcess(indexLinksProcess, 'Index links')
      return true
    } catch (error) {
      console.log(error)
    }
  }
}

module.exports = renderIndexLinks
