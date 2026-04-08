// Inject the Prince refine script into the merged HTML
// so that Prince can detect and fix layout issues during rendering.

const fs = require('fs-extra')
const fsPath = require('path')

// Inject the refine script into the merged HTML file.
// The script is added as an inline <script> in the <head>,
// before any other scripts, so it runs first.
function injectRefineScript (mergedHtmlPath) {
  const scriptPath = fsPath.join(__dirname, 'prince-refine.prince')
  const scriptContent = fs.readFileSync(scriptPath, 'utf8')

  let html = fs.readFileSync(mergedHtmlPath, 'utf8')

  // Build the script tag
  const scriptTag = '<script data-refine="true">\n' +
    scriptContent + '\n' +
    '</script>'

  // Insert before </head> if possible, otherwise before </body>
  if (html.includes('</head>')) {
    html = html.replace('</head>', scriptTag + '\n</head>')
  } else if (html.includes('</body>')) {
    html = html.replace('</body>', scriptTag + '\n</body>')
  } else {
    // Append to end as fallback
    html += '\n' + scriptTag
  }

  fs.writeFileSync(mergedHtmlPath, html)
  return true
}

// Remove the refine script from the merged HTML
// (cleanup after Prince has run).
function removeRefineScript (mergedHtmlPath) {
  let html = fs.readFileSync(mergedHtmlPath, 'utf8')
  html = html.replace(/<script data-refine="true">[\s\S]*?<\/script>\n?/g, '')
  fs.writeFileSync(mergedHtmlPath, html)
}

module.exports = {
  injectRefineScript: injectRefineScript,
  removeRefineScript: removeRefineScript
}
