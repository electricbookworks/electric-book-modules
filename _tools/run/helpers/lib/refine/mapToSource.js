// Map PDF text back to source markdown files.
// Uses fingerprint matching (preferred) or fuzzy text matching
// between detected paragraphs and the content of markdown source files.

const fs = require('fs-extra')
const fsPath = require('path')
const yaml = require('js-yaml')
const ebSlugify = require('../../../../utilities/slugify')

// Normalize text for comparison: collapse whitespace,
// strip markdown formatting, lowercase.
function normalizeText (text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\{:\.[\w\s.-]+\}/g, '') // strip IALs like {:.tighten-5}
    .replace(/\{%[^%]*%\}/g, '') // strip Liquid tags
    .replace(/<!--[\s\S]*?-->/g, '') // strip HTML comments
    .replace(/!\[.*?\]\(.*?\)/g, '') // strip images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links -> text
    .replace(/[*_~`#>|]/g, '') // strip markdown chars
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

// Extract paragraphs from a markdown file.
// Returns an array of { text, lineNumber, rawText }
// where lineNumber is the 1-based starting line of the paragraph.
function extractMarkdownParagraphs (content) {
  const lines = content.split('\n')
  const paragraphs = []
  let currentPara = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Skip YAML frontmatter
    if (i === 0 && trimmed === '---') {
      let j = i + 1
      while (j < lines.length && lines[j].trim() !== '---') {
        j++
      }
      i = j
      continue
    }

    // Skip Liquid tags, HTML comments, IALs, blank lines
    if (trimmed.startsWith('{%') || trimmed.startsWith('<!--') ||
        trimmed.match(/^\{:\.[\w.-]+\}$/) || trimmed === '') {
      if (currentPara) {
        paragraphs.push(currentPara)
        currentPara = null
      }
      continue
    }

    // Skip pure image lines
    if (trimmed.match(/^!\[/)) {
      if (currentPara) {
        paragraphs.push(currentPara)
        currentPara = null
      }
      continue
    }

    // Headings are their own paragraph
    if (trimmed.startsWith('#')) {
      if (currentPara) {
        paragraphs.push(currentPara)
      }
      currentPara = {
        text: trimmed,
        lineNumber: i + 1,
        rawText: trimmed,
        isHeading: true
      }
      paragraphs.push(currentPara)
      currentPara = null
      continue
    }

    // List items start a new paragraph
    if (trimmed.match(/^[-*+\d.]\s/) || trimmed.match(/^\d+\.\s/)) {
      if (currentPara) {
        paragraphs.push(currentPara)
      }
      currentPara = {
        text: trimmed,
        lineNumber: i + 1,
        rawText: trimmed,
        isList: true
      }
      continue
    }

    // Otherwise, this is body text
    if (!currentPara) {
      currentPara = {
        text: trimmed,
        lineNumber: i + 1,
        rawText: trimmed
      }
    } else {
      currentPara.text += ' ' + trimmed
      currentPara.rawText += '\n' + line
    }
  }

  if (currentPara) {
    paragraphs.push(currentPara)
  }

  return paragraphs
}

// Generate an opening and closing slug from markdown text,
// replicating the logic in setup.js's ebAssignFingerprints.
// setup.js uses ebSlugify(innerText.slice(0, 20)) and slice(-20),
// then strips hyphens. We do the same on normalized markdown text.
function paragraphSlugs (text) {
  // Strip markdown formatting to approximate innerText
  const plain = text
    .replace(/\{:\.[\w\s.-]+\}/g, '')
    .replace(/\{%[^%]*%\}/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_~`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  const opening = ebSlugify(plain.slice(0, 20)).replace(/-/g, '')
  const closing = ebSlugify(plain.slice(-20)).replace(/-/g, '')
  return { opening: opening, closing: closing }
}

// Match a fingerprint against source paragraphs.
// A fingerprint looks like: SECTION-1-P-3-itwasthebestoftimes-greeofcomparisononly
// We extract the trailing opening and closing slugs and match against
// the slugified opening/closing of each markdown paragraph.
function findByFingerprint (fingerprint, sourceFiles) {
  if (!fingerprint) return null

  // Split fingerprint into components
  const parts = fingerprint.split('-')
  if (parts.length < 2) return null

  // The last two components are the closing and opening slugs.
  // But the slug components themselves may be empty if text is short.
  // The format is: ...TAG-IDX-openingslug-closingslug
  // We need to locate the opening and closing portions.
  // Walk backwards: last part is closing, second-to-last is opening,
  // but only if they are purely lowercase alpha (not tag names or numbers).

  // Find the opening and closing slugs from the fingerprint.
  // The fingerprint ends with: openingslug-closingslug
  // Both are lowercase, no digits, no uppercase.
  // Work backwards to find where the tag/index portion ends.
  let slugStart = -1
  for (let i = parts.length - 1; i >= 0; i--) {
    // Tag names are uppercase, indexes are numeric
    if (parts[i].match(/^[A-Z]+$/) || parts[i].match(/^\d+$/)) {
      slugStart = i + 1
      break
    }
  }

  if (slugStart < 0 || slugStart >= parts.length) return null

  // Everything from slugStart to second-to-last is the opening slug,
  // and the last part is the closing slug.
  // Actually: the fingerprint has exactly two slug parts at the end.
  // Parts before that are structural (TAG-IDX pairs).
  // The format is: TAG-IDX-TAG-IDX-openingslug-closingslug
  // So there are always exactly 2 slug parts after the last numeric index.
  const fpOpening = parts.length >= 2 ? parts[parts.length - 2] : ''
  const fpClosing = parts[parts.length - 1]

  if (!fpOpening && !fpClosing) return null

  let bestMatch = null
  let bestScore = 0

  sourceFiles.forEach(function (source) {
    source.paragraphs.forEach(function (para) {
      if (para.isHeading) return
      if (para.text.trim().length < 10) return

      const slugs = paragraphSlugs(para.text)

      // Score: both slugs matching is ideal (score 1.0),
      // one matching is partial (score 0.5).
      let score = 0
      if (fpOpening && slugs.opening === fpOpening) score += 0.5
      if (fpClosing && slugs.closing === fpClosing) score += 0.5

      // Require at least the opening slug to match
      if (score > bestScore && score >= 0.5) {
        bestScore = score
        bestMatch = {
          file: source.file,
          filePath: source.filePath,
          lineNumber: para.lineNumber,
          score: score,
          paragraph: para,
          matchMethod: 'fingerprint'
        }
      }
    })
  })

  return bestMatch
}

// Find the best matching markdown paragraph for a given PDF text.
// Returns { file, lineNumber, score, paragraph } or null.
function findBestMatch (pdfText, sourceFiles, fingerprint) {
  // Try fingerprint matching first (more reliable)
  if (fingerprint) {
    const fpMatch = findByFingerprint(fingerprint, sourceFiles)
    if (fpMatch) return fpMatch
  }

  // Fall back to fuzzy text matching
  const normalizedPdfText = normalizeText(pdfText)

  // Minimum length to bother matching
  if (normalizedPdfText.length < 20) return null

  let bestMatch = null
  let bestScore = 0

  sourceFiles.forEach(function (source) {
    source.paragraphs.forEach(function (para) {
      // Skip headings for paragraph matching
      if (para.isHeading) return

      const normalizedParaText = normalizeText(para.text)
      if (normalizedParaText.length < 20) return

      const score = textSimilarity(normalizedPdfText, normalizedParaText)
      if (score > bestScore && score > 0.6) {
        bestScore = score
        bestMatch = {
          file: source.file,
          filePath: source.filePath,
          lineNumber: para.lineNumber,
          score: score,
          paragraph: para
        }
      }
    })
  })

  return bestMatch
}

// Simple text similarity based on shared words.
// Returns a value between 0 and 1.
function textSimilarity (a, b) {
  const wordsA = a.split(/\s+/)
  const wordsB = new Set(b.split(/\s+/))

  if (wordsA.length === 0 || wordsB.size === 0) return 0

  // Use the longer text's length for the denominator
  // to avoid scores above 1.0.
  const longer = Math.max(wordsA.length, wordsB.size)
  let matches = 0

  wordsA.forEach(function (word) {
    if (wordsB.has(word)) matches++
  })

  return matches / longer
}

// Load all markdown source files for a book and extract paragraphs.
// Returns array of { file, filePath, paragraphs }.
function loadSourceFiles (argv) {
  const bookDir = argv.book || 'book'
  let filenames

  // Try to load the file list from _data/works/<book>/default.yml
  const yamlPath = fsPath.normalize(
    process.cwd() + '/_data/works/' + bookDir + '/default.yml'
  )
  if (fs.existsSync(yamlPath)) {
    const metadata = yaml.load(fs.readFileSync(yamlPath, 'utf8'))
    const format = argv.format || 'print-pdf'
    if (metadata.products && metadata.products[format] &&
        metadata.products[format].files) {
      filenames = metadata.products[format].files
    } else if (metadata.products && metadata.products['print-pdf'] &&
               metadata.products['print-pdf'].files) {
      filenames = metadata.products['print-pdf'].files
    }
  }

  // Fall back to reading all .md files in the book directory
  if (!filenames) {
    const dir = fsPath.normalize(process.cwd() + '/' + bookDir)
    filenames = fs.readdirSync(dir)
      .filter(function (f) { return f.endsWith('.md') })
      .map(function (f) { return f.replace('.md', '') })
  }

  // Handle language subdirectory
  let baseDir = fsPath.normalize(process.cwd() + '/' + bookDir)
  if (argv.language) {
    baseDir = fsPath.normalize(process.cwd() + '/' + bookDir + '/' + argv.language)
  }

  const sourceFiles = []

  filenames.forEach(function (filename) {
    // Handle object-style file entries (e.g. { "filename": "label" })
    if (typeof filename === 'object') {
      filename = Object.keys(filename)[0]
    }

    const filePath = fsPath.normalize(baseDir + '/' + filename + '.md')
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8')
      const paragraphs = extractMarkdownParagraphs(content)
      sourceFiles.push({
        file: filename,
        filePath: filePath,
        paragraphs: paragraphs
      })
    }
  })

  return sourceFiles
}

// Map an array of issues to their source markdown locations.
// Mutates each issue by adding: sourceFile, sourceFilePath, sourceLineNumber.
function mapIssuesToSource (issues, sourceFiles) {
  issues.forEach(function (issue) {
    const match = findBestMatch(issue.text, sourceFiles, issue.fingerprint)
    if (match) {
      issue.sourceFile = match.file
      issue.sourceFilePath = match.filePath
      issue.sourceLineNumber = match.lineNumber
      issue.matchScore = match.score
      issue.matchMethod = match.matchMethod || 'text'
    }
  })

  return issues
}

module.exports = {
  loadSourceFiles: loadSourceFiles,
  mapIssuesToSource: mapIssuesToSource,
  extractMarkdownParagraphs: extractMarkdownParagraphs,
  findBestMatch: findBestMatch,
  normalizeText: normalizeText
}
