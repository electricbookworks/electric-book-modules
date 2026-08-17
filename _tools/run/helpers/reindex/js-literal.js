// Serialize a JS value to a source string that conforms to
// Standard style, so the generated index files pass linting:
// - 2-space indentation
// - single-quoted strings (double quotes only to avoid escaping
//   single quotes, matching Standard's avoidEscape)
// - unquoted object keys where they're valid identifiers
// - spaces inside object braces, none inside array brackets
// - no trailing commas

// Whether a key can be written as an unquoted object property.
function isValidIdentifier (key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
}

// Escape the body of a string for the chosen quote character.
function escapeBody (string, quote) {
  return string
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .split(quote).join('\\' + quote)
}

// Serialize a string, preferring single quotes but using double
// quotes when that avoids escaping single quotes (avoidEscape).
function serializeString (string) {
  const hasSingleQuote = string.includes("'")
  const hasDoubleQuote = string.includes('"')
  const quote = (hasSingleQuote && !hasDoubleQuote) ? '"' : "'"
  return quote + escapeBody(string, quote) + quote
}

function serialize (value, indent) {
  if (value === null || value === undefined) {
    return 'null'
  }

  const type = typeof value

  if (type === 'number' || type === 'boolean') {
    return String(value)
  }

  if (type === 'string') {
    return serializeString(value)
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]'
    }
    const inner = indent + '  '
    const items = value.map(function (item) {
      return inner + serialize(item, inner)
    })
    return '[\n' + items.join(',\n') + '\n' + indent + ']'
  }

  if (type === 'object') {
    const keys = Object.keys(value)
    if (keys.length === 0) {
      return '{}'
    }
    const inner = indent + '  '
    const props = keys.map(function (key) {
      const keyString = isValidIdentifier(key) ? key : serializeString(key)
      return inner + keyString + ': ' + serialize(value[key], inner)
    })
    return '{\n' + props.join(',\n') + '\n' + indent + '}'
  }

  return 'null'
}

// Serialize a value to a Standard-style JS literal string.
function toStandardJsLiteral (value) {
  return serialize(value, '')
}

module.exports = toStandardJsLiteral
