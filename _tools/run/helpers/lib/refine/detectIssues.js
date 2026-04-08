// Detect layout issues in parsed PDF pages.
// Groups text items into lines and paragraphs,
// then identifies widows, orphans, and short lines.
//
// Terminology (per electricbookworks/electric-book#162):
//   Widow:     a single line at the BOTTOM of a page
//              (a paragraph barely starts, with only one line before the break)
//   Orphan:    a single line at the TOP of a page
//              (a paragraph carried over from the previous page, with only
//              one line remaining on this page)
//   Short-line: a very short last line of a paragraph (e.g. <= 5 characters)
//
// Severity scoring (best to worst):
//   0 = no issues
//   1 = short-line
//   2 = widow on a left-hand (verso) page
//   3 = widow on a right-hand (recto) page
//   4 = wide orphan (> half measure) on a right-hand page
//   5 = wide orphan (> half measure) on a left-hand page
//   6 = narrow orphan (<= half measure) on a right-hand page
//   7 = narrow orphan (<= half measure) on a left-hand page

// In a book, odd page numbers are right-hand (recto),
// even page numbers are left-hand (verso).
function isRecto (pageNumber) {
  return pageNumber % 2 === 1
}

// Group text items on the same page into lines
// (items with the same y-coordinate, within tolerance).
function groupIntoLines (textItems, tolerance) {
  if (!tolerance) tolerance = 2
  const lines = []
  let currentLine = null

  // Sort by y descending (top of page first in PDF coords),
  // then x ascending (left to right).
  const sorted = textItems.slice().sort(function (a, b) {
    if (Math.abs(a.y - b.y) > tolerance) return b.y - a.y
    return a.x - b.x
  })

  sorted.forEach(function (item) {
    if (!currentLine || Math.abs(item.y - currentLine.y) > tolerance) {
      currentLine = {
        y: item.y,
        items: [item],
        text: item.text
      }
      lines.push(currentLine)
    } else {
      currentLine.items.push(item)
      currentLine.text += item.text
    }
  })

  // Calculate line widths from extent of items
  lines.forEach(function (line) {
    const minX = Math.min.apply(null, line.items.map(function (i) { return i.x }))
    const maxItem = line.items.reduce(function (a, b) {
      return (a.x + a.width) > (b.x + b.width) ? a : b
    })
    line.width = (maxItem.x + maxItem.width) - minX
    line.x = minX
    line.fontHeight = line.items[0].fontHeight
  })

  return lines
}

// Group consecutive lines into paragraphs.
// Uses heuristics: a new paragraph starts when
// there's a larger gap than the typical line spacing,
// or when the font changes significantly,
// or when there's a clear indent.
function groupIntoParagraphs (lines, pageWidth) {
  if (lines.length === 0) return []

  const paragraphs = []
  let currentPara = { lines: [lines[0]] }

  for (let i = 1; i < lines.length; i++) {
    const prevLine = lines[i - 1]
    const line = lines[i]

    // The gap between this line and the previous one
    // (in PDF coordinates, y decreases going down)
    const gap = prevLine.y - line.y
    const expectedGap = prevLine.fontHeight * 1.4

    // Heuristics for paragraph break:
    // 1. Gap is significantly larger than expected line spacing
    // 2. Font size changed substantially
    // 3. Previous line is much shorter than the measure (ends early)
    const largeGap = gap > expectedGap * 1.5
    const fontChanged = Math.abs(line.fontHeight - prevLine.fontHeight) > 1
    const prevLineShort = prevLine.width < pageWidth * 0.5

    if (largeGap || fontChanged || prevLineShort) {
      paragraphs.push(currentPara)
      currentPara = { lines: [line] }
    } else {
      currentPara.lines.push(line)
    }
  }

  paragraphs.push(currentPara)

  // Build paragraph text and metadata
  paragraphs.forEach(function (para) {
    para.text = para.lines.map(function (l) { return l.text }).join(' ')
    para.lineCount = para.lines.length
    para.firstLine = para.lines[0]
    para.lastLine = para.lines[para.lines.length - 1]
  })

  return paragraphs
}

// Detect issues in pages of parsed PDF data.
// Returns an array of issue objects, each with a severity score.
function detectIssues (pages, options) {
  if (!options) options = {}
  // Short-line: paragraph's last line has very few characters
  const shortLineMaxChars = options.shortLineMaxChars || 5
  // Minimum lines in a paragraph to bother checking for short-lines
  const minParagraphLines = options.minParagraphLines || 3

  const issues = []

  // Build paragraph data for each page
  const pageData = pages.map(function (page) {
    const lines = groupIntoLines(page.textItems)
    // Estimate line measure from the widest body-text lines
    const bodyLines = lines.filter(function (l) {
      return l.fontHeight < 14 && l.fontHeight > 6
    })
    const measure = bodyLines.length > 0
      ? Math.max.apply(null, bodyLines.map(function (l) { return l.width }))
      : page.width * 0.7

    const paragraphs = groupIntoParagraphs(lines, measure)
    return {
      pageNumber: page.pageNumber,
      width: page.width,
      height: page.height,
      lines: lines,
      paragraphs: paragraphs,
      measure: measure
    }
  })

  for (let i = 0; i < pageData.length; i++) {
    const page = pageData[i]
    const prevPage = i > 0 ? pageData[i - 1] : null
    const nextPage = i < pageData.length - 1 ? pageData[i + 1] : null
    const recto = isRecto(page.pageNumber)

    // --- Short-line detection ---
    // A very short last line (e.g. <= 5 characters) at end of a paragraph.
    // Severity: 1 (the mildest issue).
    page.paragraphs.forEach(function (para) {
      if (para.lineCount < minParagraphLines) return
      const lastLineChars = para.lastLine.text.trim().length
      if (lastLineChars <= shortLineMaxChars && lastLineChars > 0) {
        issues.push({
          type: 'short-line',
          severity: 1,
          pageNumber: page.pageNumber,
          recto: recto,
          text: para.text,
          lastLineText: para.lastLine.text,
          lastLineChars: lastLineChars,
          lineCount: para.lineCount,
          suggestion: estimateTightenValue(para)
        })
      }
    })

    // --- Widow detection ---
    // A widow is when a paragraph starts at the bottom of a page
    // with only one line before the page breaks. We detect this by
    // looking for a single-line paragraph at the bottom of the page
    // that continues onto the next page.
    //
    // Heuristic: the last paragraph on the page has exactly 1 line,
    // and the first paragraph on the next page is in the same font
    // (indicating a split paragraph).
    if (nextPage && page.paragraphs.length > 0 && nextPage.paragraphs.length > 0) {
      const lastParaOnPage = page.paragraphs[page.paragraphs.length - 1]
      const firstParaOnNextPage = nextPage.paragraphs[0]

      // A paragraph split across pages: last para on this page
      // has only 1 line, and the first content on the next page
      // is in the same font (a continuation).
      if (lastParaOnPage.lineCount === 1) {
        const sameFont = Math.abs(
          lastParaOnPage.firstLine.fontHeight -
          firstParaOnNextPage.firstLine.fontHeight
        ) < 1

        if (sameFont) {
          // Severity: 2 for verso (left), 3 for recto (right)
          const severity = recto ? 3 : 2
          issues.push({
            type: 'widow',
            severity: severity,
            pageNumber: page.pageNumber,
            recto: recto,
            text: lastParaOnPage.text + ' ' + firstParaOnNextPage.text,
            lastLineText: lastParaOnPage.lastLine.text,
            lineCount: lastParaOnPage.lineCount + firstParaOnNextPage.lineCount,
            suggestion: estimateTightenValue({
              lineCount: lastParaOnPage.lineCount + firstParaOnNextPage.lineCount,
              lastLine: firstParaOnNextPage.lastLine
            })
          })
        }
      }
    }

    // --- Orphan detection ---
    // An orphan is when a paragraph ends at the top of a page
    // with only one line remaining (the rest is on the previous page).
    //
    // Heuristic: the first paragraph on this page has exactly 1 line,
    // and it appears to be a continuation from the previous page.
    if (prevPage && page.paragraphs.length > 0 && prevPage.paragraphs.length > 0) {
      const firstParaOnPage = page.paragraphs[0]
      const lastParaOnPrevPage = prevPage.paragraphs[prevPage.paragraphs.length - 1]

      if (firstParaOnPage.lineCount === 1) {
        const sameFont = Math.abs(
          firstParaOnPage.firstLine.fontHeight -
          lastParaOnPrevPage.lastLine.fontHeight
        ) < 1

        if (sameFont) {
          // Is this orphan line wider than half the measure?
          const orphanLineRatio = firstParaOnPage.firstLine.width / page.measure
          const isWide = orphanLineRatio > 0.5

          // Severity scoring from issue #162:
          // Wide orphan on recto: 4, on verso: 5
          // Narrow orphan on recto: 6, on verso: 7
          let severity
          if (isWide) {
            severity = recto ? 4 : 5
          } else {
            severity = recto ? 6 : 7
          }

          issues.push({
            type: 'orphan',
            severity: severity,
            pageNumber: page.pageNumber,
            prevPageNumber: prevPage.pageNumber,
            recto: recto,
            orphanWide: isWide,
            orphanLineRatio: orphanLineRatio,
            text: lastParaOnPrevPage.text + ' ' + firstParaOnPage.text,
            lastLineText: firstParaOnPage.firstLine.text,
            lineCount: lastParaOnPrevPage.lineCount + 1,
            suggestion: estimateTightenValue({
              lineCount: lastParaOnPrevPage.lineCount + 1,
              lastLine: firstParaOnPage.firstLine
            })
          })
        }
      }
    }
  }

  // Sort by severity (worst first), then by page number
  issues.sort(function (a, b) {
    if (a.severity !== b.severity) return b.severity - a.severity
    return a.pageNumber - b.pageNumber
  })

  return issues
}

// Estimate a tighten value for a paragraph.
// The goal is to save enough space across all lines
// to eliminate one line from the paragraph.
// Each tighten-N step is 0.001em of letter-spacing.
// Typical body text at 10pt has ~60 characters per line.
// tighten-5 (0.005em) saves roughly 0.3em per line,
// which across a 10-line paragraph might save half a line.
function estimateTightenValue (para) {
  const lineCount = para.lineCount || 3

  // Conservative: start small. A human reviewer will adjust.
  // For short paragraphs, suggest a stronger tighten.
  // For long paragraphs, a small tighten distributed across
  // many lines has a bigger cumulative effect.
  let value
  if (lineCount <= 4) {
    value = 8
  } else if (lineCount <= 8) {
    value = 5
  } else if (lineCount <= 15) {
    value = 3
  } else {
    value = 2
  }

  // Cap at 10: human-noticeable tracking changes above
  // 10/1000 em are generally unacceptable.
  value = Math.min(value, 10)

  return 'tighten-' + value
}

module.exports = {
  detectIssues: detectIssues,
  groupIntoLines: groupIntoLines,
  groupIntoParagraphs: groupIntoParagraphs
}
