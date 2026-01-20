// Lint with JS Standard

// Import modules
const { parallel } = require('gulp')

// Import tasks
const {
  epubXhtmlLinks, epubXhtmlFiles, epubCleanHtmlFiles, runEpubTransformations
} = require('./gulp/processors/epub.js')

const {
  runPDFTransformations
} = require('./gulp/processors/pdf.js')

const {
  imagesPrintPDF, imagesScreenPDF,
  imagesEpub, imagesApp, imagesWeb,
  imagesSmall, imagesMedium, imagesLarge,
  imagesXLarge, imagesMax
} = require('./gulp/processors/images.js')

const {
  renderIndexCommentsAsTargets, renderIndexListReferences
} = require('./gulp/processors/indexes.js')

const { js } = require('./gulp/processors/js.js')
const { svgsPrintPDF, svgsScreenPDF, svgsWeb, svgsEpub, svgsApp } = require('./gulp/processors/svgs.js')
const { yaml } = require('./gulp/processors/yaml.js')

// Make tasks available to gulp
exports.default = parallel(
  svgsPrintPDF,
  svgsScreenPDF,
  svgsWeb,
  svgsEpub,
  svgsApp,
  imagesPrintPDF,
  imagesScreenPDF,
  imagesEpub,
  imagesApp,
  imagesWeb,
  imagesSmall,
  imagesMedium,
  imagesLarge,
  imagesXLarge,
  imagesMax)

exports.images = parallel(
  imagesPrintPDF,
  imagesScreenPDF,
  imagesEpub,
  imagesApp,
  imagesWeb,
  imagesSmall,
  imagesMedium,
  imagesLarge,
  imagesXLarge,
  imagesMax)

exports.epubXhtmlLinks = epubXhtmlLinks
exports.epubXhtmlFiles = epubXhtmlFiles
exports.epubCleanHtmlFiles = epubCleanHtmlFiles
exports.runEpubTransformations = runEpubTransformations

exports.runPDFTransformations = runPDFTransformations

exports.renderIndexCommentsAsTargets = renderIndexCommentsAsTargets
exports.renderIndexListReferences = renderIndexListReferences

exports.js = js

exports.svgs = parallel(
  svgsPrintPDF,
  svgsScreenPDF,
  svgsWeb,
  svgsEpub,
  svgsApp
)

exports.yaml = yaml
