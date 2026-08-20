import ebIndexLists from '../index-lists'

if (process.env.settings['dynamic-indexing'] !== false && (process.env.output === 'web' || process.env.output === 'app')) {
  // the require below is replaced by webpack with one that points at the specific split index file for this entry
  const ebIndexTargets = require('@indexes/index')
  /*
    Script that adds index-reference links.
    This is used both in the browser
    and by gulp for PDF and epub outputs.
  */
  ebIndexLists(ebIndexTargets)
}
