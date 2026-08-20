const fsPath = require('path')
const works = require('../paths/works.js')
const translations = require('../paths/translations.js')
const fileList = require('../paths/fileList.js')
const pathExists = require('../paths/pathExists.js')
const configsObject = require('./configsObject.js')
const filesInDocs = require('./filesInDocs.js')
const filesInProjectNav = require('./filesInProjectNav.js')

// An object containing info on all content files
// listed for published works in _data/works,
// listed in _data/nav.yml, and in _docs.
// Options can be:
// - docs: include | exclude (Includes docs or not. Default is include)
// - check: true | false (Check if files exist. Default is false.)
async function allFilesListed (argv, options) {
  const data = []
  const allWorks = await works()
  const navFiles = await filesInProjectNav()
  const docs = await filesInDocs()

  let format = 'web' // fallback
  if (argv && argv.format) {
    format = argv.format
  }

  return new Promise(function (resolve) {
    // Get files in each work
    allWorks.forEach(async function (work) {
      const filesInWork = fileList(argv, work)

      if (filesInWork) {
        filesInWork.forEach(function (file) {
          let filename = file

          // Some files are listed as an object,
          // with a keyword as a value, e.g.
          // { "01": "Chapter 1"}
          // and we only want the key here.
          if (typeof file === 'object') {
            filename = Object.keys(file)[0]
          }

          const filePath = work + '/' + filename + '.html'

          const fileData = {
            path: filePath,
            book: work,
            language: ''
          }

          if (options && options.check) {
            if (pathExists(fsPath.normalize(process.cwd() + '/_site/' + filePath))) {
              data.push(fileData)
            }
          } else {
            data.push(fileData)
          }
        })
      }

      // Now get the file for its translations
      const translationLanguages = await translations(work)

      if (translationLanguages) {
        translationLanguages.forEach(function (language) {
          const filesInTranslation = fileList(argv, work, language)

          if (filesInTranslation) {
            filesInTranslation.forEach(function (translationFile) {
              let filename = translationFile

              // Some files are listed as an object,
              // with a keyword as a value, e.g.
              // { "01": "Chapter 1"}
              // and we only want the key here.
              if (typeof translationFile === 'object') {
                filename = Object.keys(translationFile)[0]
              }

              const filePath = work + '/' + language + '/' + filename + '.html'

              const fileData = {
                path: filePath,
                book: work,
                language
              }

              if (options && options.check) {
                if (pathExists(fsPath.normalize(process.cwd() + '/_site/' + filePath))) {
                  data.push(fileData)
                }
              } else {
                data.push(fileData)
              }
            })
          }
        })
      }
    })

    // Get files listed in the project nav,
    // if this is a web or app build.
    const includeNavFiles = format === 'web' || format === 'app'
    if (includeNavFiles) {
      navFiles.forEach(function (file) {
        const filePath = file + '.html'
        const fileData = {
          path: filePath
        }
        if (options && options.check) {
          if (pathExists(fsPath.normalize(process.cwd() + '/_site/' + filePath))) {
            data.push(fileData)
          }
        } else {
          data.push(fileData)
        }
      })
    }

    // Add docs, if they are enabled in _config,
    // and if this is a web or app build.
    const includeDocs = (format === 'web' || format === 'app') &&
      (options && options.docs !== 'exclude')
    if (includeDocs && configsObject(argv)?.collections?.docs?.output === true) {
      docs.forEach(function (file) {
        const filePath = file + '.html'
        const fileData = {
          path: filePath
        }
        if (options && options.check) {
          if (pathExists(fsPath.normalize(process.cwd() + '/_site/' + filePath))) {
            data.push(fileData)
          }
        } else {
          data.push(fileData)
        }
      })
    }

    resolve(data)
  })
}

module.exports = allFilesListed
