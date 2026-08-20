const fsPath = require('path')
const os = require('os')
const spawn = require('cross-spawn')
const logProcess = require('./logProcess.js')
const mathjaxEnabled = require('./mathjaxEnabled.js')
const htmlFilePaths = require('../paths/htmlFilePaths.js')
const pathExists = require('../paths/pathExists.js')

// Processes mathjax in output HTML
async function renderMathjax (argv, options) {
  try {
    if (mathjaxEnabled(argv) || argv.mathjax) {
      console.log('Rendering MathJax...')

      // Get the HTML file(s) to render. If we are merging
      // input files, we only pass the merged file,
      // Unless `--merged false` was passed at the command line,
      // or there is no merged file for some reason.

      // Check if a merged.html exists
      let mergedFilePath = fsPath.normalize(process.cwd() +
        '/_site/' + argv.book + '/merged.html')

      if (argv.language) {
        mergedFilePath = fsPath.normalize(process.cwd() +
        '/_site/' + argv.book + '/' + argv.language + '/merged.html')
      }

      const mergedFileExists = pathExists(mergedFilePath)

      let inputFiles
      if (options && options.allFiles === true) {
        inputFiles = await htmlFilePaths(argv, null, { allFiles: true })
      } else if (mergedFileExists && argv.merged !== false) {
        inputFiles = [mergedFilePath]
      } else if (['web', 'epub', 'app'].includes(argv.format) ||
                 argv.merged === false) {
        inputFiles = await htmlFilePaths(argv)
      }

      // Get the MathJax script
      const mathJaxScript = process.cwd() +
      '/_tools/run/helpers/mathjax/tex2mml-page.js'

      // Process MathJax on the files in parallel, but with a bounded
      // concurrency so we don't spawn one Node process per file all at
      // once. Spawning hundreds/thousands of processes would exhaust
      // memory on small CI/Codespaces VMs (2 core / 8GB). At any moment
      // no more than `concurrency` processes run, refilling as each finishes.
      const filesToRender = inputFiles.filter(path => pathExists(path))
      const concurrency = Math.max(1, os.cpus().length)

      const renderFile = path => {
        console.log('Rendering maths in ' + path + ' using script ' + mathJaxScript)
        const mathJaxProcess = spawn(
          'node',
          [mathJaxScript, path, path]
        )
        return logProcess(mathJaxProcess, 'Rendering MathJax')
      }

      let nextIndex = 0
      const worker = async () => {
        while (nextIndex < filesToRender.length) {
          const path = filesToRender[nextIndex++]
          await renderFile(path)
        }
      }

      await Promise.all(
        Array.from(
          { length: Math.min(concurrency, filesToRender.length) },
          () => worker()
        )
      )
      return true
    } else {
      return true
    }
  } catch (error) {
    console.log(error)
  }
}

module.exports = renderMathjax
