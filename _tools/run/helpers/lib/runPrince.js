const fs = require('fs-extra')
const fsPath = require('path')
const prince = require('prince')
const checkPrinceVersion = require('./checkPrinceVersion.js')
const outputFilename = require('./outputFilename.js')
const htmlFilePaths = require('../paths/htmlFilePaths.js')
const variantSettings = require('../settings/variantSettings.js')

// Run Prince
// options (optional): { onStdout, maxPasses }
async function runPrince (argv, options) {
  options = options || {}

  // Check if we're using the correct Prince version
  await checkPrinceVersion()

  return new Promise(function (resolve, reject) {
    console.log('Rendering HTML to PDF with PrinceXML...')

    // Get Prince license file, if any
    // (and allow for 'correct' spelling, licence).
    let princeLicenseFile = ''
    let princeLicensePath
    const princeConfig = require(process.cwd() + '/package.json').prince
    if (princeConfig && princeConfig.license) {
      princeLicensePath = princeConfig.license
    } else if (princeConfig && princeConfig.licence) {
      princeLicensePath = fsPath.normalize(princeConfig.licence)
    }
    if (fs.existsSync(princeLicensePath)) {
      princeLicenseFile = princeLicensePath
      console.log('Using PrinceXML licence found at ' + princeLicenseFile)
    }

    // Get the HTML file to render. If we are merging
    // input files, we only pass the merged file to Prince.
    // Unless `--merged false` was passed at the command line.
    let inputFiles = fsPath.normalize(process.cwd() +
      '/_site/' + argv.book + '/merged.html')
    if (argv.language) {
      inputFiles = fsPath.normalize(process.cwd() +
      '/_site/' + argv.book + '/' + argv.language + '/merged.html')
    }

    if (argv.merged === false) {
      inputFiles = htmlFilePaths(argv)
    }

    // Get the book's stylesheet, so we can pass it
    // to Prince as a user stylesheet.
    // By passing a user style sheet, we give SVGs
    // that are referenced as `img src=""`
    // access to the stylesheet, including its font-faces.

    // Default CSS filename
    let styleSheetFilename = argv.format + '.css'

    // Check the project settings for an active variant,
    // and any variant-specific stylesheets we should use.
    if (variantSettings(argv).active && variantSettings(argv).stylesheet) {
      styleSheetFilename = variantSettings(argv).stylesheet
    }

    // Apply the stylesheet with that name
    // that we find in the styles folder beside
    // the first HTML document we're rendering.
    let stylesheet = fsPath.normalize(process.cwd() +
      '/_site/' + argv.book +
      '/styles/' + styleSheetFilename)
    if (argv.language) {
      stylesheet = fsPath.normalize(process.cwd() +
      '/_site/' + argv.book + '/' + argv.language + '/' +
      '/styles/' + styleSheetFilename)
    }

    // Currently, node-prince does not seem to
    // log its progress to stdout. Possible WIP:
    // https://github.com/rse/node-prince/pull/7
    prince()
      .license('./' + princeLicenseFile)
      .inputs(inputFiles)
      .output(process.cwd() + '/_output/' + outputFilename(argv))
      .option('style', stylesheet)
      .option('javascript')

      // If your project uses an old version of Prince,
      // you will need to uncomment unsupported options:
      // tagged-pdf, max-passes, fail-dropped-content,
      // fail-missing-glyphs
      .option('tagged-pdf')

    // These options add too much logging
    // to be useful, but are available if needed.
    // .option('verbose')
    // .option('debug')

      // We use set forced to true for these
      // (the third parameter passed for an option)
      // because they are new and not necessarily
      // supported by the installed version
      // of node-prince.
      .option('max-passes', options.maxPasses || 3, true)
      .option('fail-dropped-content', true, true)

    // The following options are very strict,
    // and can cause an unnecessary number of failures
    // especially when working on maths books.
    // .option('fail-missing-glyphs', true, true)
    // .option('no-system-fonts', true, true)

      .timeout(100 * 100000) // large timeout required for large books
      .maxbuffer(10 * 1024) // show progress more often
      .on('stderr', function (line) {
        console.error(line)
        if (line.includes('assets/js/dist')) {
          console.log('\n\n-----------------------\n')
          console.log('TAKE NOTE:\n\n')
          console.error('The PDF build has failed.')
          console.error('Prince encountered an error in the compiled JavaScript in assets/js/dist.')
          console.error('Report this to your nearest EBW developer or your project lead.')
          console.log('\n\nThe error:\n')
          console.log(line)
          console.log('\n\n-----------------------\n\n')
          process.exit(1)
        }
      })
      .on('stdout', function (line) {
        if (options.onStdout) {
          options.onStdout(line)
        } else {
          console.log(line)
        }
      })
      .execute()
      .then(function () {
        resolve()
      }, function (error) {
        console.log(error)
        reject(error)
      })
  })
}

module.exports = runPrince
