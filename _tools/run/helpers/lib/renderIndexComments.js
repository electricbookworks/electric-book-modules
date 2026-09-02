const works = require('../paths/works.js')
const translations = require('../paths/translations.js')
const languagePathSegment = require('../paths/languagePathSegment.js')
const projectSettings = require('./projectSettings.js')
const processComments = require('./processComments.js')

// Manage the rendering of index comments for one or all works
async function renderIndexComments (argv, options) {
  try {
    const allWorks = await works()

    if (projectSettings()['dynamic-indexing'] !== false) {
      console.log('Processing indexing comments ...')

      if (options && options.allFiles === true) {
        allWorks.forEach(async function (work) {
          await processComments(work)

          const languages = await translations(work)

          languages.forEach(async function (language) {
            await processComments(work, language)
          })
        })
      } else {
        // Pass the language only for a real translation; the parent
        // (default) language's content lives at the book root.
        const language = languagePathSegment(argv) ? argv.language : undefined
        await processComments(argv.book, language)
      }
    }
    return true
  } catch (error) {
    return error
  }
}

module.exports = renderIndexComments
