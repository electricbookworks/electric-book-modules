// Webpack loader that turns the indexing entry template
// (assets/js/entries/indexing.js) into a per-book entry by injecting
// the specific split index file to require.
//
// The target index file is passed as a resource query, e.g.
//   index-entry-loader.js!.../entries/indexing.js?file=web-mybook-index
// and this loader replaces the template's
//   require(`@indexes/book-index-${process.env.output}`)
// with
//   require('@indexes/web-mybook-index')

module.exports = function indexEntryLoader (source) {
  const query = this.resourceQuery || ''
  const file = new URLSearchParams(query.replace(/^\?/, '')).get('file')

  if (!file) {
    return source
  }

  // Replace the template's @indexes require (any quote style) with one
  // that points at this entry's specific split index file.
  return source.replace(
    /require\(\s*[`'"]@indexes\/[^`'"]*[`'"]\s*\)/,
    "require('@indexes/" + file + "')"
  )
}
