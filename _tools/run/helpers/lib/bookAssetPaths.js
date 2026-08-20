const fs = require('fs-extra')
const fsPath = require('path')
const variantSettings = require('../settings/variantSettings.js')

// Get array of book-asset file paths for this output.
// assetType can be images or styles.
// options.parentOnly forces the parent (untranslated) asset path,
// even when a translation has its own assets. This is needed because
// a translation that has its own styles links to BOTH the parent
// stylesheet and its own, so the build needs to resolve each in turn.
function bookAssetPaths (argv, assetType, folder, options) {
  options = options || {}
  // Provide fallback book folder, which lets us
  // specify the 'assets' folder.
  let book
  if (folder) {
    book = folder
  } else if (argv.book) {
    book = argv.book
  } else {
    book = 'book'
  }

  // Image assets are in a subdirectory
  let formatSubdirectory = ''
  if (assetType === 'images') {
    formatSubdirectory = argv.format
  }

  const pathToTranslatedAssets = fsPath.normalize(process.cwd() +
        '/_site/' +
        book + '/' +
        argv.language + '/' +
        assetType + '/' +
        formatSubdirectory)

  const pathToParentAssets = fsPath.normalize(process.cwd() +
        '/_site/' +
        book + '/' +
        assetType + '/' +
        formatSubdirectory)

  // If translated assets exist, use that path,
  // otherwise use the parent assets.
  // When options.parentOnly is set, always use the parent assets.
  let pathToAssets
  if (!options.parentOnly &&
            argv.language &&
            fs.existsSync(pathToTranslatedAssets) &&
            fs.readdirSync(pathToTranslatedAssets).length > 0) {
    pathToAssets = pathToTranslatedAssets
  } else {
    pathToAssets = pathToParentAssets
  }

  console.log('Using files in ' + pathToAssets)

  // For styles, we only return a single path
  // to the stylesheet in the paths array.
  // Otherwise, we create one or more paths.
  let paths
  if (assetType === 'styles') {
    // Set the default stylesheet filename
    let styleSheetFilename = argv.format + '.css'

    // Get any active variant stylesheet
    if (variantSettings(argv).active) {
      styleSheetFilename = variantSettings(argv).stylesheet
    }

    // Add the stylesheet's path to the paths array
    const stylesheetPath = fsPath.normalize(pathToAssets +
      styleSheetFilename)
    paths = [stylesheetPath]
  } else {
    // Create an array of files
    const files = fs.readdirSync(pathToAssets)

    // Extract filenames from file objects,
    // and prepend path to each filename.
    paths = files.map(function (filename) {
      if (typeof filename === 'object') {
        return fsPath.normalize(pathToAssets + '/' +
                      Object.keys(filename)[0])
      } else {
        return fsPath.normalize(pathToAssets + '/' +
                      filename)
      }
    })
  }

  return paths
}

module.exports = bookAssetPaths
