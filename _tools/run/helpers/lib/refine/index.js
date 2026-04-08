// Refine PDF layout by detecting widows, orphans, and
// other layout issues, then applying tighten/loosen classes
// to the source markdown files.
//
// Two approaches are supported:
//
// 1. Prince-native (default): Injects a detection script into the
//    merged HTML before Prince renders. Prince detects issues using
//    its box tracking API, applies classes to the DOM for re-layout,
//    and outputs a structured manifest. Node then applies the same
//    classes to the source markdown.
//
// 2. PDF.js fallback (--refine-method=pdfjs): Parses an existing PDF
//    with pdfjs-dist to detect issues heuristically. Useful when
//    Prince is unavailable or its JS support is limited.

const fs = require('fs-extra')
const fsPath = require('path')
const { loadSourceFiles, mapIssuesToSource } = require('./mapToSource.js')
const { applyClasses } = require('./applyClasses.js')
const { injectRefineScript, removeRefineScript } = require('./injectScript.js')
const { parseManifest } = require('./parseManifest.js')
const runPrince = require('../runPrince.js')
const outputFilename = require('../outputFilename.js')

async function refine (argv) {
  'use strict'

  console.log('Refining layout for ' + argv.book + ' (' + argv.format + ')...')

  // Choose approach
  const method = argv.refineMethod || 'prince'

  if (method === 'pdfjs') {
    await refinePdfjs(argv)
  } else {
    await refinePrince(argv)
  }
}

// --- Prince-native approach ---

async function refinePrince (argv) {
  // 1. Find the merged HTML
  let mergedPath
  if (argv.language) {
    mergedPath = fsPath.normalize(
      process.cwd() + '/_site/' + argv.book + '/' +
      argv.language + '/merged.html'
    )
  } else {
    mergedPath = fsPath.normalize(
      process.cwd() + '/_site/' + argv.book + '/merged.html'
    )
  }

  if (!fs.existsSync(mergedPath)) {
    console.error(
      'Merged HTML not found at ' + mergedPath + '\n' +
      'Run `eb output --format ' + argv.format +
      ' --book ' + argv.book + '` first to generate the HTML,\n' +
      'or use --refine-method=pdfjs to analyse an existing PDF.'
    )
    process.exit(1)
  }

  // 2. Inject the refine script
  console.log('Injecting refine script into merged HTML...')
  injectRefineScript(mergedPath)

  // 3. Run Prince using the same pipeline as `eb output`,
  //    with extra passes for refinement and a stdout callback
  //    to capture the structured manifest.
  console.log('Running Prince with layout detection...')
  let princeOutput = ''

  try {
    await runPrince(argv, {
      maxPasses: 5,
      onStdout: function (line) {
        princeOutput += line + '\n'
        if (!line.startsWith('REFINE_')) {
          console.log(line)
        }
      }
    })
  } finally {
    // 4. Clean up: remove the injected script
    removeRefineScript(mergedPath)
  }

  // 5. Parse the manifest from Prince output
  const manifest = parseManifest(princeOutput)
  console.log(
    'Prince completed in ' + manifest.passes + ' pass(es), ' +
    manifest.totalChanges + ' change(s) applied to PDF layout.'
  )

  if (manifest.changes.length === 0) {
    console.log('No widows, orphans, or short lines detected. Layout looks good!')
    return
  }

  // 6. Convert manifest changes to issue format for source mapping
  const issues = manifest.changes.map(function (change) {
    return {
      type: change.reason,
      severity: change.severity,
      pageNumber: change.pageNum,
      recto: change.recto,
      suggestion: change.className,
      text: change.textPreview,
      lastLineText: change.textPreview,
      elementTag: change.elementTag,
      elementId: change.elementId,
      fingerprint: change.fingerprint
    }
  })

  // 7. Load source files and map
  const sourceFiles = loadSourceFiles(argv)
  console.log('Loaded ' + sourceFiles.length + ' source file(s).')

  mapIssuesToSource(issues, sourceFiles)

  const mapped = issues.filter(function (i) { return i.sourceFile })
  const unmapped = issues.filter(function (i) { return !i.sourceFile })

  console.log(
    'Mapped ' + mapped.length + ' of ' + issues.length +
    ' issue(s) to source markdown.'
  )

  // 8. Apply or report
  if (argv.dryRun) {
    reportIssues(issues)
    return
  }

  if (mapped.length > 0) {
    const result = applyClasses(mapped)
    console.log(
      'Applied ' + result.applied + ' class(es) to markdown, ' +
      'skipped ' + result.skipped + '.'
    )
  }

  reportIssues(issues)

  if (mapped.length > 0) {
    console.log(
      '\nReview the changes in your source markdown files,' +
      ' then re-render to verify.'
    )
  }
}

// --- PDF.js fallback approach ---

async function refinePdfjs (argv) {
  const parsePdf = require('./parsePdf.js')
  const { detectIssues } = require('./detectIssues.js')

  const pdfName = outputFilename(argv)
  const pdfPath = fsPath.normalize(process.cwd() + '/_output/' + pdfName)

  if (!fs.existsSync(pdfPath)) {
    console.error(
      'PDF not found at ' + pdfPath + '\n' +
      'Run `eb output --format ' + argv.format +
      ' --book ' + argv.book + '` first to generate the PDF.'
    )
    process.exit(1)
  }

  console.log('Parsing ' + pdfName + ' with PDF.js...')

  let pages
  try {
    pages = await parsePdf(pdfPath)
  } catch (error) {
    console.error('Failed to parse PDF: ' + error.message)
    process.exit(1)
  }

  console.log('Parsed ' + pages.length + ' pages.')

  const issues = detectIssues(pages)

  if (issues.length === 0) {
    console.log('No widows or orphans detected. Layout looks good!')
    return
  }

  console.log('Found ' + issues.length + ' potential layout issue(s).')

  const sourceFiles = loadSourceFiles(argv)
  console.log('Loaded ' + sourceFiles.length + ' source file(s).')

  mapIssuesToSource(issues, sourceFiles)

  const mapped = issues.filter(function (i) { return i.sourceFile })

  console.log(
    'Mapped ' + mapped.length + ' of ' + issues.length +
    ' issue(s) to source markdown.'
  )

  if (argv.dryRun) {
    reportIssues(issues)
    return
  }

  if (mapped.length > 0) {
    const result = applyClasses(mapped)
    console.log(
      'Applied ' + result.applied + ' class(es), ' +
      'skipped ' + result.skipped + '.'
    )
  }

  reportIssues(issues)

  if (mapped.length > 0) {
    console.log(
      '\nReview the changes in your source files, then re-render the PDF to check.'
    )
  }
}

// Print a summary table of detected issues.
function reportIssues (issues) {
  // Sort worst-first (highest severity first),
  // then by page number within the same severity.
  var sorted = issues.slice().sort(function (a, b) {
    if (b.severity !== a.severity) return b.severity - a.severity
    return (a.pageNumber || 0) - (b.pageNumber || 0)
  })

  console.log('\n--- Layout issues (sorted worst-first) ---\n')

  const severityLabels = {
    1: 'SHORT-LINE',
    2: 'WIDOW (verso)',
    3: 'WIDOW (recto)',
    4: 'ORPHAN wide (recto)',
    5: 'ORPHAN wide (verso)',
    6: 'ORPHAN narrow (recto)',
    7: 'ORPHAN narrow (verso)'
  }

  sorted.forEach(function (issue, index) {
    const num = (index + 1) + '.'
    const label = severityLabels[issue.severity] || issue.type.toUpperCase()
    const page = 'p.' + issue.pageNumber
    const source = issue.sourceFile
      ? issue.sourceFile + '.md:' + issue.sourceLineNumber
      : '(unmapped)'
    const suggestion = issue.suggestion || '?'
    const status = issue.applied ? 'APPLIED' : (issue.sourceFile ? 'READY' : 'UNMAPPED')
    const method = issue.matchMethod ? ' [' + issue.matchMethod + ']' : ''
    const preview = (issue.lastLineText || issue.text || '').substring(0, 60)

    console.log(
      num + ' [sev ' + issue.severity + ' ' + label + '] ' + page + ' | ' +
      source + ' | ' + suggestion + ' | ' +
      status + method + '\n   "' + preview + '"'
    )
  })

  console.log('')
}

module.exports = refine
