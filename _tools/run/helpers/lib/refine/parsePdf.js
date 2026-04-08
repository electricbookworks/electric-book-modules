// Parse a PDF file and extract text items with their positions.
// Each text item includes: text content, page number, x/y position,
// width, height, and font size.

const fsPath = require('path')

// Parse a PDF and return structured page data.
// Returns an array of page objects, each containing:
// - pageNumber (1-based)
// - width, height (page dimensions in PDF points)
// - textItems: array of { text, x, y, width, height, fontHeight }
async function parsePdf (pdfPath) {
  // Dynamic import for ES module
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')

  const loadingTask = pdfjsLib.getDocument({
    url: fsPath.resolve(pdfPath),
    // Disable workers for Node.js usage
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true
  })
  const pdfDocument = await loadingTask.promise

  const pages = []

  for (let i = 1; i <= pdfDocument.numPages; i++) {
    const page = await pdfDocument.getPage(i)
    const viewport = page.getViewport({ scale: 1.0 })
    const textContent = await page.getTextContent()

    const textItems = textContent.items
      .filter(function (item) {
        return item.str && item.str.trim().length > 0
      })
      .map(function (item) {
        // item.transform is [scaleX, skewX, skewY, scaleY, translateX, translateY]
        const fontHeight = Math.abs(item.transform[3])
        return {
          text: item.str,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          height: item.height,
          fontHeight: fontHeight
        }
      })

    pages.push({
      pageNumber: i,
      width: viewport.width,
      height: viewport.height,
      textItems: textItems
    })
  }

  return pages
}

module.exports = parsePdf
