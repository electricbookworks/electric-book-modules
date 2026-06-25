// Refine PDF layout by detecting lone lines and short lines,
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
const { loadSourceFiles, mapIssuesToSource, findBestMatch } = require('./mapToSource.js')
const { applyClasses } = require('./applyClasses.js')
const { injectRefineScript, removeRefineScript, injectHighlightScript, removeHighlightScript, injectHighlightStyles, removeHighlightStyles } = require('./injectScript.js')
const { parseManifest } = require('./parseManifest.js')
const runPrince = require('../lib/runPrince.js')
const outputFilename = require('../lib/outputFilename.js')
const jekyll = require('../lib/jekyll.js')
const pdfPipeline = require('../lib/pdfPipeline.js')

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
  // 0. Rebuild the merged HTML from current source markdown so that
  // the detection starts from a clean baseline. Without this, stale
  // tighten/loosen classes from a previous refine run could be baked
  // into the cached merged HTML under _site/.
  console.log('Rebuilding merged HTML from source (incremental)...')
  const freshArgv = Object.assign({}, argv, { incremental: true })
  await jekyll(freshArgv)
  await pdfPipeline(freshArgv)

  // 1. Find the merged HTML. The filename includes the format so that
  // print-pdf and screen-pdf merged files don't overwrite each other.
  const mergedFilename = 'merged-' + argv.format + '.html'
  let mergedPath
  if (argv.language) {
    mergedPath = fsPath.normalize(
      process.cwd() + '/_site/' + argv.book + '/' +
      argv.language + '/' + mergedFilename
    )
  } else {
    mergedPath = fsPath.normalize(
      process.cwd() + '/_site/' + argv.book + '/' + mergedFilename
    )
  }

  if (!fs.existsSync(mergedPath)) {
    // Fall back to screen-pdf if print-pdf merged HTML is missing
    if (argv.format === 'print-pdf') {
      const fallbackFormat = 'screen-pdf'
      const fallbackFilename = 'merged-' + fallbackFormat + '.html'
      const fallbackPath = argv.language
        ? fsPath.normalize(process.cwd() + '/_site/' + argv.book + '/' +
            argv.language + '/' + fallbackFilename)
        : fsPath.normalize(process.cwd() + '/_site/' + argv.book + '/' +
            fallbackFilename)
      if (fs.existsSync(fallbackPath)) {
        console.warn(
          'No merged HTML found for print-pdf. ' +
          'Falling back to screen-pdf merged HTML.\n' +
          'Run `eb output --format print-pdf --book ' + argv.book +
          '` to refine the print PDF instead.'
        )
        argv.format = fallbackFormat
        mergedPath = fallbackPath
      } else {
        console.error(
          'Merged HTML not found at ' + mergedPath + '\n' +
          'Run `eb output --format ' + argv.format +
          ' --book ' + argv.book + '` first to generate the HTML,\n' +
          'or use --refine-method=pdfjs to analyse an existing PDF.'
        )
        process.exit(1)
      }
    } else {
      console.error(
        'Merged HTML not found at ' + mergedPath + '\n' +
        'Run `eb output --format ' + argv.format +
        ' --book ' + argv.book + '` first to generate the HTML,\n' +
        'or use --refine-method=pdfjs to analyse an existing PDF.'
      )
      process.exit(1)
    }
  }

  // 2. Inject the refine script
  console.log('Injecting refine script into merged HTML...')
  injectRefineScript(mergedPath, {
    maxShift: typeof argv['max-shift'] === 'number' ? argv['max-shift'] : 2
  })

  // 3. Run Prince using the same pipeline as `eb output`,
  //    with extra passes for refinement and a stdout callback
  //    to capture the structured manifest. Use a detection-specific
  //    output filename so we don't overwrite the user's real output PDF
  //    with a detection-pass PDF that has debug highlights.
  console.log('Running Prince with layout detection...')
  let princeOutput = ''
  const detectionFilename = outputFilename(argv).replace('.pdf', '-detection.pdf')
  const detectionArgv = Object.assign({}, argv, {
    outputFilename: detectionFilename
  })

  try {
    await runPrince(detectionArgv, {
      maxPasses: 45,
      onStdout: function (line) {
        princeOutput += line + '\n'
        if (line.startsWith('REFINE_DEBUG') ||
            line.startsWith('REFINE_CHANGE')) {
          // Pass debug and change lines through
          console.log(line)
        } else if (!line.startsWith('REFINE_')) {
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
    console.log('No lone lines or short lines detected. Layout looks good!')
    return
  }

  // 6. Convert manifest changes to issue format for source mapping
  const issues = manifest.changes.map(function (change) {
    return {
      type: change.reason, // 'lone-line-top', 'lone-line-bottom', or 'short-line'
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

    // Rebuild the PDF with the refined classes applied.
    // We skip emptyDir and webpack (expensive) and use Jekyll's
    // --incremental flag so only changed files are rebuilt.
    const refinedFilename = outputFilename(argv).replace('.pdf', '-refined.pdf')
    const refinedArgv = Object.assign({}, argv, {
      incremental: true,
      outputFilename: refinedFilename
    })
    console.log('\nRebuilding HTML with refined classes (incremental)...')
    await jekyll(refinedArgv)
    await pdfPipeline(refinedArgv)

    // When --highlight is set, inject CSS that colours applied
    // tighten/loosen classes, plus the detection script in
    // highlight-only mode to mark unfixed issues with
    // .unfixed-refinement-issue. Both are removed after Prince runs.
    if (argv.highlight) {
      console.log('Injecting highlight styles and detection script...')
      injectHighlightStyles(mergedPath)
      injectHighlightScript(mergedPath)
    }

    console.log('Rendering refined PDF...')
    let spacingOutput = ''
    try {
      if (argv.highlight) {
        // Capture stdout to collect REFINE_SPACING lines from
        // the highlight-only detection script.
        await runPrince(refinedArgv, {
          onStdout: function (line) {
            if (line.startsWith('REFINE_SPACING')) {
              spacingOutput += line + '\n'
            } else if (!line.startsWith('REFINE_')) {
              console.log(line)
            }
          }
        })
      } else {
        await runPrince(refinedArgv)
      }
    } finally {
      if (argv.highlight) {
        removeHighlightStyles(mergedPath)
        removeHighlightScript(mergedPath)
      }
    }
    console.log('Refined PDF saved to _output/' + refinedFilename)

    // Report wide word-spacing lines with source file info.
    if (argv.highlight && spacingOutput) {
      reportSpacingIssues(spacingOutput, sourceFiles)
    }
  }

  reportIssues(issues)

  if (argv.highlight) {
    console.log('\nHighlight colours in the PDF:')
    console.log('  Blue:   tightened paragraphs')
    console.log('  Orange: loosened paragraphs')
    console.log('  Green:  added space (lone-line-bottom or lone-line-top fix)')
    console.log('  Pink:   unfixed issues')
  }

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
    console.log('No lone lines detected. Layout looks good!')
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

// Parse REFINE_SPACING lines from Prince stdout and print
// a report of wide word-spacing lines with source file info.
function reportSpacingIssues (spacingOutput, sourceFiles) {
  const lines = spacingOutput.split('\n').filter(function (l) {
    return l.startsWith('REFINE_SPACING|')
  })
  if (lines.length === 0) return

  // Parse each line into structured data
  const spacingIssues = lines.map(function (line) {
    const parts = {}
    line.replace('REFINE_SPACING|', '').split('|').forEach(function (segment) {
      const eq = segment.indexOf('=')
      if (eq > -1) {
        parts[segment.substring(0, eq)] = segment.substring(eq + 1)
      }
    })
    return parts
  })

  // Map fingerprints to source files
  spacingIssues.forEach(function (issue) {
    if (issue.fingerprint && sourceFiles) {
      const match = findBestMatch(issue.text || '', sourceFiles, issue.fingerprint)
      if (match) {
        issue.sourceFile = match.file
        issue.sourceLineNumber = match.lineNumber
      }
    }
  })

  console.log('\n--- Wide word-spacing lines (in refined layout) ---\n')
  spacingIssues.forEach(function (issue, index) {
    const num = (index + 1) + '.'
    const page = 'p.' + (issue.page || '?')
    const density = issue.density || '?'
    const linePos = issue.line || '?'
    const source = issue.sourceFile
      ? issue.sourceFile + '.md:' + issue.sourceLineNumber
      : '(unmapped)'
    const preview = (issue.text || '').substring(0, 70)
    console.log(
      num + ' ' + page + ' | ' + source + ' | line ' + linePos +
      ' | density ' + density +
      '\n   "' + preview + '..."'
    )
  })
  console.log(
    '\nTotal: ' + spacingIssues.length + ' line(s) with wide word spacing.\n'
  )
}

// Print a summary table of detected issues.
function reportIssues (issues) {
  // Sort by source file and line number (markdown order),
  // falling back to page number for unmapped issues (listed last).
  var sorted = issues.slice().sort(function (a, b) {
    var aFile = a.sourceFile || ''
    var bFile = b.sourceFile || ''
    // Unmapped issues (no source file) go last
    if (aFile && !bFile) return -1
    if (!aFile && bFile) return 1
    if (aFile !== bFile) return aFile < bFile ? -1 : 1
    var aLine = a.sourceLineNumber || 0
    var bLine = b.sourceLineNumber || 0
    if (aLine !== bLine) return aLine - bLine
    return (a.pageNumber || 0) - (b.pageNumber || 0)
  })

  console.log('\n--- Layout issues (in source order) ---\n')

  const severityLabels = {
    1: 'SHORT-LINE',
    2: 'LONE-LINE-BOTTOM (verso)',
    3: 'LONE-LINE-BOTTOM (recto)',
    4: 'LONE-LINE-TOP wide (recto)',
    5: 'LONE-LINE-TOP wide (verso)',
    6: 'LONE-LINE-TOP narrow (recto)',
    7: 'LONE-LINE-TOP narrow (verso)'
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
