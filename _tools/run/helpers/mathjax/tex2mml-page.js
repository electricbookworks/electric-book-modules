#!/usr/bin/env node

// This script is adapted from
// https://github.com/mathjax/MathJax-demos-node/blob/master/cjs/component/tex2mml
// The main adaptation is that it accepts an extra argument
// path for path of the converted file

const fs = require('fs')

// On Windows, MathJax v4's context.path() rewrites absolute component paths
// into file:// URLs (intended for ESM import()). The CommonJS component loader
// used here calls require() on those names, and Node cannot resolve a file://
// URL string via require() on Windows, so it throws "Cannot find module".
// Strip the file:// scheme before resolution so require() sees a plain path.
//
// This patches Node's private Module._resolveFilename, so we keep it as
// narrowly scoped as possible: it is only applied on Windows (the only
// platform where the paths carry the file:// scheme), and it is installed
// only around the MathJax load/typeset and restored as soon as that finishes
// (see installResolverPatch/restoreResolverPatch usage below).
const Module = require('module')
const originalResolveFilename = Module._resolveFilename

// Only Windows produces the file:// component paths that break require().
const needsResolverPatch = process.platform === 'win32'

// Resolver that strips a leading file:// scheme before delegating to the
// original Node resolver, so require() sees a plain path it can resolve.
function patchedResolveFilename (request, ...args) {
  if (typeof request === 'string' && request.startsWith('file://')) {
    request = request.slice('file://'.length)
  }
  return originalResolveFilename.call(this, request, ...args)
}

// Install the patch (Windows only). Called immediately before loading MathJax.
function installResolverPatch () {
  if (needsResolverPatch) {
    Module._resolveFilename = patchedResolveFilename
  }
}

// Restore the original resolver so the patch does not affect the rest of the
// process. Called once MathJax has finished loading and typesetting.
function restoreResolverPatch () {
  if (needsResolverPatch) {
    Module._resolveFilename = originalResolveFilename
  }
}

/*************************************************************************
 *
 *  component/tex2mml-page
 *
 *  Uses MathJax v4 to convert all TeX in an HTML document to MathML.
 *
 * ----------------------------------------------------------------------
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

//  The default TeX packages to use
const PACKAGES = 'base, ams, newcommand, textmacros, require, autoload'

//  Get the command-line arguments
const argv = require('yargs')
  .demand(0).strict()
  .usage('$0 [options] "math"')
  .options({
    em: {
      default: 16,
      describe: 'em-size in pixels'
    },
    packages: {
      default: PACKAGES,
      describe: 'the packages to use, e.g. "base, ams"; use "*" to represent the default packages, e.g, "*, bbox"'
    },
    dist: {
      boolean: true,
      default: false,
      describe: 'true to use webpacked version, false to use source files'
    }
  })
  .argv

//  Read the HTML file
const htmlfile = require('fs').readFileSync(argv._[0], 'utf8')

// Get the path for the output file
const outputFilePath = argv._[1]

//  A renderAction to take the place of typesetting.
//  It renders the output to MathML instead.
function renderMathML (math, doc) {
  const adaptor = doc.adaptor
  const mml = global.MathJax.startup.toMML(math.root)
  math.typesetRoot = adaptor.firstChild(adaptor.body(adaptor.parse(mml, 'text/html')))
}

//  Configure MathJax
global.MathJax = {
  loader: {
    failed: (err) => console.error(err),
    paths: { mathjax: '@mathjax/src/bundle' },
    source: (argv.dist ? {} : require('@mathjax/src/components/js/source.js').source),
    require,
    load: ['adaptors/liteDOM', 'input/tex']
  },
  options: {
    renderActions: {
      typeset: [150, (doc) => { for (const math of doc.math) renderMathML(math, doc) }, renderMathML]
    }
  },
  tex: {
    packages: argv.packages.replace('*', PACKAGES).split(/\s*,\s*/)
  },
  'adaptors/liteDOM': {
    fontSize: argv.em
  },
  startup: {
    typeset: true,
    document: htmlfile,
    ready () {
      global.MathJax.startup.defaultReady()
    }
  }
}

//  Load the MathJax startup module.
//  The resolver patch is installed just before this load and restored once the
//  startup promise settles below, so it is scoped to MathJax only. Restoring
//  after the promise (rather than immediately after this require) is deliberate:
//  the "require"/"autoload" TeX packages can lazily load further components
//  during typesetting, which happens inside the promise chain.
installResolverPatch()
require('@mathjax/src/' + (argv.dist ? 'bundle' : 'components/js') + '/startup/startup.js')

//  Wait for MathJax to start up, and then render the math.
//  Then output the resulting HTML file.
global.MathJax.startup.promise.then(() => {
  const adaptor = global.MathJax.startup.adaptor
  const html = global.MathJax.startup.document
  html.render()

  // Log the convert doc to the console
  // console.log(adaptor.doctype(html.document))
  // console.log(adaptor.outerHTML(adaptor.root(html.document)))

  // Write the converted HTML file
  let outputFileContents = adaptor.outerHTML(adaptor.root(html.document))

  // Prince doesn't compute the default MathML accent attribute
  // from the operator dictionary, causing accents like tildes
  // to render too high above base characters. This explicitly
  // sets accent="true" on <mover> elements where MathJax outputs
  // a non-stretchy <mo> (indicating an accent like ~ ^ etc.).
  outputFileContents = outputFileContents.replace(
    /<mover(?![^>]*accent)>((?:(?!<\/mover>)[\s\S])*?<mo stretchy="false">)/g,
    '<mover accent="true">$1'
  )

  // Prince also positions accents at a uniform height regardless
  // of the base character (e.g. tilde over z sits as high as over F).
  // For single-character bases, replace <mover> with combining
  // Unicode characters so the font handles correct per-character
  // accent height positioning.
  const combiningAccents = {
    '~': '\u0303',
    '^': '\u0302'
  }
  outputFileContents = outputFileContents.replace(
    /<mover accent="true"[^>]*>\s*<mi([^>]*)>(.)<\/mi>\s*<mo stretchy="false">(.)<\/mo>\s*<\/mover>/g,
    function (match, miAttrs, base, accent) {
      const combining = combiningAccents[accent]
      if (combining) {
        // Adding the combining character makes <mi> multi-character,
        // which MathML renders upright. Force italic to match the
        // original single-char <mi> default styling.
        const variantAttr = miAttrs.includes('mathvariant')
          ? ''
          : ' mathvariant="italic"'
        return '<mi' + variantAttr + miAttrs + '>' + base + combining + '</mi>'
      }
      return match
    }
  )

  fs.writeFile(outputFilePath, outputFileContents, (err) => {
    if (err) throw err
  })
}).catch(err => console.log(err)).finally(restoreResolverPatch)
