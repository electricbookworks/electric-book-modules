#!/usr/bin/env node

// This script is adapted from
// https://github.com/mathjax/MathJax-demos-node/blob/master/cjs/component/tex2mml
// The main adaptation is that it accepts an extra argument
// path for path of the converted file

const fs = require('fs')

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

// MathJax is configured with the default TeX delimiters: \(...\) for inline
// math, and $$...$$ or \[...\] for display math (see the book template's
// assets/js/mathjax/extensions/tex2jax.js). A wrapper containing none of these
// opening delimiters has no math to convert, so it is copied through untouched.
function hasMath (html) {
  return /\\\(|\\\[|\$\$/.test(html)
}

// Split the merged HTML into a prefix (everything up to and including the
// opening <body> tag), an array of body segments, and a suffix (the closing
// </body> onwards). Each top-level `<div class="wrapper …">` becomes one
// `wrapper` segment; everything else (whitespace, scripts) is a `passthrough`
// segment preserved verbatim. Each source file contributes exactly one
// top-level wrapper, and equations never span wrapper boundaries, so
// converting each wrapper independently is safe.
function splitDocument (html) {
  const bodyOpen = html.match(/<body\b[^>]*>/i)
  const bodyCloseIndex = html.lastIndexOf('</body>')
  if (!bodyOpen || bodyCloseIndex === -1) {
    return null
  }

  const prefixEnd = bodyOpen.index + bodyOpen[0].length
  const prefix = html.slice(0, prefixEnd)
  const body = html.slice(prefixEnd, bodyCloseIndex)
  const suffix = html.slice(bodyCloseIndex)

  const segments = []
  let hasWrapper = false
  let depth = 0
  let wrapperStart = -1
  let lastIndex = 0

  // Match comments and <script> blocks so any `<div>` text inside them is
  // consumed as a single token and never miscounted; otherwise match div
  // open/close tags to track nesting depth.
  const tokenRe =
    /<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script>|<\/?div\b[^>]*>/gi
  let match
  while ((match = tokenRe.exec(body)) !== null) {
    const token = match[0]
    if (token[1] !== '/' && token.slice(0, 4).toLowerCase() !== '<div') {
      // Comment or script block: skip without affecting depth.
      continue
    }

    const isCloseDiv = token[1] === '/'
    if (!isCloseDiv) {
      if (depth === 0 &&
          /class\s*=\s*(["'])\s*wrapper(?:\s|\1)/i.test(token)) {
        if (match.index > lastIndex) {
          segments.push({
            type: 'passthrough',
            text: body.slice(lastIndex, match.index)
          })
        }
        wrapperStart = match.index
        lastIndex = match.index
        hasWrapper = true
      }
      depth += 1
    } else {
      if (depth > 0) {
        depth -= 1
      }
      if (depth === 0 && wrapperStart !== -1) {
        const end = match.index + token.length
        segments.push({ type: 'wrapper', text: body.slice(wrapperStart, end) })
        wrapperStart = -1
        lastIndex = end
      }
    }
  }

  if (lastIndex < body.length) {
    segments.push({ type: 'passthrough', text: body.slice(lastIndex) })
  }

  return { prefix, segments, suffix, hasWrapper }
}

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
    load: ['core', 'adaptors/liteDOM', 'input/tex']
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
    // Don't typeset on startup, and parse only a trivial placeholder document
    // here. The real conversion happens below, one page wrapper at a time, so
    // MathJax/liteDOM never parses the whole merged book in a single pass.
    typeset: false,
    document: '<!DOCTYPE html><html><head></head><body></body></html>',
    ready () {
      // In source (non-dist) mode, liteDOM lazily async-loads named-entity
      // tables from '[mathjax]/util/entities/*.js'. The loader resolves
      // '[mathjax]' to the bundle dir, which has no entities, so the load
      // fails and cascades into 'Can't find handler for document'.
      // Preload all entity tables up front to avoid any async load.
      if (!argv.dist) {
        require('@mathjax/src/cjs/util/entities/all.js')
      }
      global.MathJax.startup.defaultReady()
    }
  }
}

//  Load the MathJax startup module. The webpacked bundle exposes startup.js at
//  the bundle root; only the source tree nests it under startup/startup.js.
require(argv.dist
  ? '@mathjax/src/bundle/startup.js'
  : '@mathjax/src/components/js/startup/startup.js')

//  Wait for MathJax to start up, and then render the math.
//  Then output the resulting HTML file.
global.MathJax.startup.promise.then(() => {
  const startup = global.MathJax.startup
  const adaptor = startup.adaptor

  // Convert a single HTML fragment (one page wrapper) by typesetting it in
  // its own small liteDOM document. Keeping every parse small avoids the
  // super-linear slowdown that hits when the whole merged book is parsed at
  // once. MathJax itself is loaded only once, up front.
  function convertFragment (fragment) {
    const doc = startup.getDocument(
      '<!DOCTYPE html><html><head></head><body>' + fragment + '</body></html>'
    )
    // renderMathML reads startup.document (via toMML), so point it at the
    // document we are about to render.
    startup.document = doc
    doc.render()
    return adaptor.innerHTML(adaptor.body(doc.document))
  }

  // Convert an entire HTML document in one pass. Used as a fallback when the
  // document can't be split into page wrappers (preserves the original
  // whole-document behaviour).
  function convertWholeDocument (documentHtml) {
    const doc = startup.getDocument(documentHtml)
    startup.document = doc
    doc.render()
    return adaptor.outerHTML(adaptor.root(doc.document))
  }

  // Write the converted HTML file
  let outputFileContents
  const split = splitDocument(htmlfile)

  if (!split || !split.hasWrapper) {
    // No recognisable page wrappers: fall back to whole-document conversion.
    outputFileContents = convertWholeDocument(htmlfile)
  } else {
    let convertedBody = ''
    for (const segment of split.segments) {
      if (segment.type === 'wrapper' && hasMath(segment.text)) {
        convertedBody += convertFragment(segment.text)
      } else {
        // Pages with no math (and non-wrapper content) pass through untouched.
        convertedBody += segment.text
      }
    }
    outputFileContents = split.prefix + convertedBody + split.suffix
  }

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
}).catch(err => console.log(err))
