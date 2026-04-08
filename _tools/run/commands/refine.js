// For more on yargs command modules like this one, see
// https://github.com/yargs/yargs/blob/main/docs/advanced.md#providing-a-command-module

// Modules

const refine = require('../helpers/lib/refine')

// Exports

exports.command = 'refine'
exports.desc = 'Refine PDF page layout by adding tighten/loosen classes'
exports.builder = function (yargs) {
  return yargs
    .option('refine-method', {
      describe: 'Detection method: prince (default) or pdfjs',
      choices: ['prince', 'pdfjs'],
      default: 'prince'
    })
}
exports.handler = async function (argv) {
  'use strict'

  // Default to print-pdf format if not specified
  if (!argv.format || argv.format === 'web') {
    argv.format = 'print-pdf'
  }

  await refine(argv)
}
