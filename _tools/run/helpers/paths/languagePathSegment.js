// Lint with JS Standard

// Import Node modules
const fs = require('fs-extra')
const fsPath = require('path')
const yaml = require('js-yaml')

// Return the path segment for a book's requested language.
//
// A book's parent (default) language is written by Jekyll to the book
// root, `_site/<book>/`; only translations live in a language subfolder,
// `_site/<book>/<language>/`. So for the default language (or no language
// at all) we return an empty string, and for a real translation we return
// `/<language>`.
//
// The authoritative default language is the `language` value in
// `_data/works/<book>/default.yml`. This is consistent with the way
// extraExcludesConfig decides what counts as a translation: a language
// that matches the parent is treated as parent content at the book root.
//
// Because an empty string is falsy and `/<language>` is truthy, callers
// can also use the return value to decide whether to treat the build as a
// translation at all (e.g. whether to pass a `--language` flag downstream).
function languagePathSegment (argv) {
  // No language requested: content is at the book root.
  if (!argv || !argv.language) {
    return ''
  }

  // Fall back to the default book folder, matching the convention used
  // by the other path helpers when no book is specified.
  const book = argv.book || 'book'

  // Read the book's default metadata to find its parent language.
  let defaultLanguage
  const pathToDefaultYAML = fsPath.normalize(process.cwd() +
    '/_data/works/' + book + '/default.yml')
  try {
    const metadata = yaml.load(fs.readFileSync(pathToDefaultYAML, 'utf8'))
    if (metadata && metadata.language) {
      defaultLanguage = metadata.language
    }
  } catch (error) {
    // If we can't read the metadata, we can't confirm the parent
    // language, so treat the requested language as a translation.
    return '/' + argv.language
  }

  // If the requested language is the book's parent language, its content
  // lives at the book root, so there is no language path segment.
  if (argv.language === defaultLanguage) {
    return ''
  }

  // Otherwise it's a real translation.
  return '/' + argv.language
}

module.exports = languagePathSegment
