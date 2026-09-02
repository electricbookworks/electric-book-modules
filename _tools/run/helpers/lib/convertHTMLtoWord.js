const fs = require('fs-extra')
const fsPath = require('path')
const pandoc = require('node-pandoc')
const htmlFilePaths = require('../paths/htmlFilePaths.js')
const languagePathSegment = require('../paths/languagePathSegment.js')
const pathExists = require('../paths/pathExists.js')

// Convert HTML files to another format
async function convertHTMLtoWord (argv) {
  console.log('Converting HTML to Word...')

  // Get file list for this format

  // First, assume it's all the individual files
  let filePaths = await htmlFilePaths(argv)

  // But if we've merged the HTML files,
  // use the merged file.
  if (argv.merged) {
    // Check if a merged.html exists
    const mergedFilePath = fsPath.normalize(process.cwd() +
      '/_site/' + argv.book + languagePathSegment(argv) + '/merged.html')

    const mergedFileExists = pathExists(mergedFilePath)

    if (mergedFileExists) {
      filePaths = [mergedFilePath]
    }
  }

  // Initialise a counter
  let totalConverted = 0

  // Determine the output location
  const outputLocation = fsPath.normalize(process.cwd() +
    '/_output/' +
    argv.book +
    '--' + argv.format +
    '--word')

  // Clear the previous output folder if it exists,
  // or create the output directory first if it doesn't.
  if (pathExists(outputLocation)) {
    await fs.emptyDir(outputLocation)
  } else {
    await fs.mkdir(outputLocation, { recursive: true })
  }

  return new Promise(function (resolve) {
    // Loop through files and convert with Pandoc
    filePaths.forEach(function (filePath) {
      // Build path to output file
      let fileBasename = fsPath.basename(filePath, '.html')

      // If we're converting a merged file, use the book name
      if (argv.merged) {
        fileBasename = argv.book
      }

      const outputFilePath = fsPath.normalize(outputLocation + '/' +
                    fileBasename + '.docx')

      // Passing Pandoc an array is safer than a string because
      // it handles potential spaces in the source filename.
      // We must provide --resource-path or pandoc will look
      // for images in the working directory.
      const args = ['--resource-path=' + fsPath.dirname(filePath),
        '-f', 'html', '-t', 'docx', '-s', '-o',
        outputFilePath]

      function pandocCallback (error) {
        if (error) {
          // Filter out errors that tell users
          // to install rsvg-convert, because this
          // isn't necessary for simple Word output.
          if (!error.message.includes('check that rsvg-convert is in path')) {
            console.log('Potential problem converting HTML to Word: ', error)
          }
        } else {
          totalConverted += 1

          if (totalConverted === filePaths.length) {
            console.log('Conversion to Word complete. Files in ' +
              outputLocation)
            resolve()
          }
        }
      }

      pandoc(filePath, args, pandocCallback)
    })
  })
}

module.exports = convertHTMLtoWord
