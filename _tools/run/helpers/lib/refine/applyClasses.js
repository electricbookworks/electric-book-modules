// Apply refinement classes to markdown source files.
// Inserts Kramdown IAL syntax (e.g. {:.tighten-5}) after
// the relevant paragraph in the source markdown.

const fs = require('fs-extra')

// Apply a single class to a markdown file at a specific line.
// The class is inserted as a Kramdown IAL on the line after
// the paragraph ends.
//
// issue: { sourceFilePath, sourceLineNumber, suggestion, type }
// Returns true if applied, false if skipped.
function applyClass (issue) {
  if (!issue.sourceFilePath || !issue.sourceLineNumber || !issue.suggestion) {
    return false
  }

  const content = fs.readFileSync(issue.sourceFilePath, 'utf8')
  const lines = content.split('\n')
  const startLine = issue.sourceLineNumber - 1 // 0-based index

  if (startLine < 0 || startLine >= lines.length) return false

  // Find the end of this paragraph: scan forward until we
  // hit a blank line, another paragraph, or end of file.
  let endLine = startLine
  for (let i = startLine + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim()

    // Blank line means paragraph ended
    if (trimmed === '') break

    // IAL line means paragraph already has classes
    if (trimmed.match(/^\{:[\s.#\w-]+\}$/)) break

    // Liquid tag or HTML comment means new block
    if (trimmed.startsWith('{%') || trimmed.startsWith('<!--')) break

    // Heading means new block
    if (trimmed.startsWith('#')) break

    endLine = i
  }

  // Check if there's already an IAL on the next line
  const nextLineIndex = endLine + 1
  const ialPattern = /^\{:([\s.#\w-]+)\}$/

  // Also check the line before the paragraph — kramdown allows
  // a block IAL on the preceding line to apply to the next block.
  const prevLineIndex = startLine - 1
  if (prevLineIndex >= 0 && lines[prevLineIndex].trim().match(ialPattern)) {
    const existingIal = lines[prevLineIndex].trim()
    const existingClasses = existingIal.slice(2, -1).trim()

    if (existingClasses.match(/\.(tighten|loosen)-\d+/)) {
      return false
    }

    lines[prevLineIndex] = '{:' + existingClasses + ' .' + issue.suggestion + '}'
    fs.writeFileSync(issue.sourceFilePath, lines.join('\n'))
    return true
  }

  if (nextLineIndex < lines.length && lines[nextLineIndex].trim().match(ialPattern)) {
    // An IAL already exists — add our class to it
    const existingIal = lines[nextLineIndex].trim()
    const existingClasses = existingIal.slice(2, -1).trim()

    // Don't add if this class (or a similar tighten/loosen) is already there
    if (existingClasses.match(/\.(tighten|loosen)-\d+/)) {
      return false
    }

    lines[nextLineIndex] = '{:' + existingClasses + '.' + issue.suggestion + '}'
  } else {
    // Insert a new IAL after the paragraph
    lines.splice(nextLineIndex, 0, '{:.' + issue.suggestion + '}')
  }

  fs.writeFileSync(issue.sourceFilePath, lines.join('\n'))
  return true
}

// Apply classes for all mapped issues.
// Groups by file and applies in reverse line order
// to avoid line-number shifts.
// Returns { applied, skipped } counts.
function applyClasses (issues) {
  // Only process issues that have been mapped to source
  const mappedIssues = issues.filter(function (issue) {
    return issue.sourceFilePath && issue.sourceLineNumber && issue.suggestion
  })

  // Group by file
  const byFile = {}
  mappedIssues.forEach(function (issue) {
    if (!byFile[issue.sourceFilePath]) {
      byFile[issue.sourceFilePath] = []
    }
    byFile[issue.sourceFilePath].push(issue)
  })

  let applied = 0
  let skipped = 0

  // Process each file, applying changes in reverse line order
  Object.keys(byFile).forEach(function (filePath) {
    const fileIssues = byFile[filePath].sort(function (a, b) {
      return b.sourceLineNumber - a.sourceLineNumber
    })

    fileIssues.forEach(function (issue) {
      if (applyClass(issue)) {
        applied++
        issue.applied = true
      } else {
        skipped++
        issue.applied = false
      }
    })
  })

  return { applied: applied, skipped: skipped }
}

module.exports = {
  applyClass: applyClass,
  applyClasses: applyClasses
}
