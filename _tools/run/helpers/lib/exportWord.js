const fs = require('fs-extra')
const jekyll = require('./jekyll.js')
const renderIndexComments = require('./renderIndexComments.js')
const renderIndexLinks = require('./renderIndexLinks.js')
const pdfHTMLTransformations = require('./pdfHTMLTransformations.js')
const convertHTMLtoWord = require('./convertHTMLtoWord.js')
const merge = require('../merge/index.js')

// Word export
async function exportWord (argv) {
  try {
    if (!argv.skipbuild) {
      await fs.emptyDir(process.cwd() + '/_site')
      await jekyll(argv)
    }

    // Word export does not yet support index comments
    // and index links. We need to extend the gulp tasks
    // that process comments to make them visible in Word.
    await renderIndexComments(argv)
    await renderIndexLinks(argv)
    await merge(argv)

    // Math rendering doesn't work in Word, and
    // original MathJax may be better in exports anyway
    // await renderMathjax(argv)

    if (argv.format === 'print-pdf' || argv.format === 'screen-pdf') {
      await pdfHTMLTransformations(argv)
    }

    await convertHTMLtoWord(argv)
  } catch (error) {
    console.log(error)
  }
}

module.exports = exportWord
