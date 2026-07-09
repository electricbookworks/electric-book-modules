const fsPromises = require('fs/promises')
const fsPath = require('path')
const works = require('../paths/works.js')
const configsObject = require('./configsObject.js')
const explicitOption = require('./explicitOption.js')

// Config to exclude unnecessary books and translations
// from a Jekyll build.
async function extraExcludesConfig (argv) {
  // Default is an empty config file, for no excludes.
  // Create it and/or make it an empty file.
  const pathToTempExcludesConfig = '_output/.temp/_config.excludes.yml'
  await fsPromises.mkdir('_output/.temp', { recursive: true })
  await fsPromises.writeFile(pathToTempExcludesConfig, '')

  // If we're outputting a particular book/work,
  // and the user explicitly asked for that book
  // (as opposed to omitting --book and using defaults),
  // build up a list of things we can safely exclude
  // to speed up the build.
  if (argv && argv.book && explicitOption('book')) {
    // Collect the extra paths/globs we want to exclude.
    const extraExcludes = []

    // 1. Exclude every other work (book) in this project,
    // leaving only the argv.book we want.
    const allWorks = await works()
    const worksToExclude = allWorks.filter(function (work) {
      return work !== argv.book
    })
    extraExcludes.push(...worksToExclude)

    // 2. Handle the translations of the book we ARE outputting.
    // We work out the translations from the actual subfolders of
    // the book's content folder rather than from _data/works,
    // because a translation folder can exist on disk (e.g. temp
    // files fetched for an EPUB build) without being listed in
    // the works data. Any subfolder that isn't a shared-asset
    // directory (images/ or styles/) is treated as a translation.
    //
    // Behaviour:
    // - No language requested: exclude nothing here, so the build
    //   includes the parent language AND all its translations.
    // - A translation language requested (e.g. 'es'): exclude the
    //   parent-language files and every OTHER translation folder.
    // - The parent language requested (e.g. 'en'): exclude every
    //   translation folder, leaving only the parent-language files.
    if (argv.language && explicitOption('language')) {
      // Shared-asset directories that translations inherit and
      // that must never be excluded as if they were translations.
      const sharedAssetDirs = ['images', 'styles']

      // Read the actual contents of the book folder once, so we
      // can separate files from subdirectories.
      const bookDirectory = fsPath.normalize(process.cwd() + '/' + argv.book)
      const bookDirEntries = await fsPromises.readdir(bookDirectory,
        { withFileTypes: true })

      // The translation folders are the subdirectories that aren't
      // shared assets.
      const bookTranslations = bookDirEntries
        .filter(function (entry) {
          return entry.isDirectory() && !sharedAssetDirs.includes(entry.name)
        })
        .map(function (entry) {
          return entry.name
        })

      // Is the requested language one of those translation folders,
      // or is it the book's parent (default) language?
      const requestedIsTranslation = bookTranslations.includes(argv.language)

      if (requestedIsTranslation) {
        // We're outputting one translation, so exclude:
        // (a) every OTHER translation folder (and its contents), and
        // (b) the parent-language (default) content files.

        // (a) Exclude the other translations' folders.
        bookTranslations.forEach(function (language) {
          if (language !== argv.language) {
            extraExcludes.push(argv.book + '/' + language)
          }
        })

        // (b) Exclude the parent-language content files.
        // We exclude only the files in the book folder, leaving
        // directories untouched — that keeps the wanted translation
        // subfolder and shared assets like images/ and styles/ in
        // the build. We use the actual files rather than the YAML
        // `files` list because a book folder can hold many extra
        // files (such as questions and quizzes pulled in with
        // include_relative) that aren't in that list.
        bookDirEntries.forEach(function (entry) {
          if (entry.isFile()) {
            extraExcludes.push(argv.book + '/' + entry.name)
          }
        })
      } else {
        // The requested language is not a translation folder, so
        // we treat it as the parent (default) language: exclude
        // every translation folder, leaving only the parent files.
        bookTranslations.forEach(function (language) {
          extraExcludes.push(argv.book + '/' + language)
        })
      }
    }

    // Get the current excludes list from the merged configs,
    // so we add to it rather than replacing it.
    const excludes = configsObject(argv).exclude

    // Combine the existing excludes with our extra ones,
    // removing any duplicates.
    const newExcludes = [...new Set(excludes.concat(extraExcludes))]

    // That's only the list of values. To create a valid
    // key:value property, we need the `exclude:` key.
    const excludesProperty = {
      exclude: newExcludes
    }

    // Write the new excludes config as a YAML file
    // lineWidth: -1 disables js-yaml's line wrapping, so long
    // filenames stay on a single line for easier readability.
    const yaml = require('js-yaml')
    const excludesYAML = yaml.dump(excludesProperty, { lineWidth: -1 })
    await fsPromises.writeFile(pathToTempExcludesConfig, excludesYAML)
  }

  // Return the path to the new excludes config
  return pathToTempExcludesConfig
}

module.exports = extraExcludesConfig
