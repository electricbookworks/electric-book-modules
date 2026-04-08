// Parse the structured manifest that the Prince refine script
// outputs to stdout during PDF rendering.
//
// The manifest format is:
//   REFINE_MANIFEST_START
//   REFINE_CHANGE|className|reason|severity|pageNum|recto|tag|id|fingerprint|textPreview
//   ...
//   REFINE_MANIFEST_END
//   REFINE_SUMMARY:passes=N,changes=N

// Parse Prince output lines and extract the refine manifest.
// Returns { changes: [...], passes: N, totalChanges: N }
function parseManifest (output) {
  const lines = output.split('\n')
  const changes = []
  let inManifest = false
  let passes = 0
  let totalChanges = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    if (line === 'REFINE_MANIFEST_START') {
      inManifest = true
      continue
    }

    if (line === 'REFINE_MANIFEST_END') {
      inManifest = false
      continue
    }

    if (line.startsWith('REFINE_SUMMARY:')) {
      const parts = line.replace('REFINE_SUMMARY:', '').split(',')
      parts.forEach(function (part) {
        const kv = part.split('=')
        if (kv[0] === 'passes') passes = parseInt(kv[1], 10)
        if (kv[0] === 'changes') totalChanges = parseInt(kv[1], 10)
      })
      continue
    }

    if (inManifest && line.startsWith('REFINE_CHANGE|')) {
      const parts = line.split('|')
      if (parts.length >= 9) {
        changes.push({
          className: parts[1],
          reason: parts[2],
          severity: parseInt(parts[3], 10),
          pageNum: parseInt(parts[4], 10),
          recto: parts[5] === 'true',
          elementTag: parts[6],
          elementId: parts[7],
          fingerprint: parts[8],
          textPreview: parts.slice(9).join('|') // text might contain |
        })
      }
    }
  }

  return {
    changes: changes,
    passes: passes,
    totalChanges: totalChanges
  }
}

module.exports = { parseManifest: parseManifest }
