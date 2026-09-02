const fs = require('fs-extra')
const fsPath = require('path')
const pathExists = require('../paths/pathExists.js')
const languagePathSegment = require('../paths/languagePathSegment.js')

// Move epub.zip to _output
async function epubZipRename (argv) {
  return new Promise(function (resolve, reject) {
    const pathToZip = fsPath.normalize(process.cwd() +
              '/_site/epub.zip')

    let epubFilename = argv.book + '.epub'
    if (languagePathSegment(argv)) {
      epubFilename = argv.book + '-' +
        argv.language +
        '.epub'
    }

    const pathToEpub = process.cwd() +
              '/_output/' +
              epubFilename

    console.log('Moving zipped epub to _output/' + epubFilename)

    if (pathExists(pathToZip)) {
      fs.move(pathToZip, pathToEpub,
        { overwrite: true })
        .then(function () {
          resolve()
        })
        .catch(function (error) {
          console.log(error)
          reject(error)
        })
    } else {
      const error = 'Epub zip folder not found at ' +
        pathToZip
      console.log(error)
      reject(error)
    }
  })
}

module.exports = epubZipRename
