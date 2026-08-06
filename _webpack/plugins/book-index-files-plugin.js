const fs = require('fs')
const path = require('path')

const pluginName = 'BookIndexFilesPlugin'

class BookIndexFilesPlugin {
  constructor (options = {}) {
    this.options = {
      // Directory to scan for book index files
      searchDir: options.searchDir || '_indexes',
      // Pattern to match book index files
      filePattern: options.filePattern || /^book-index-.*\.js$/,
      // Environment variable name
      envVar: options.envVar || 'bookIndexFiles',
      ...options
    }

    // This is the variable key we'll look for in code
    this.envVarKey = `process.env.${this.options.envVar}`

    // This will store the stringified data
    this.definition = '[]' // Default to an empty array
  }

  apply (compiler) {
    // Use the ConstDependency from the same webpack instance that is running
    // the build. Requiring 'webpack' directly can resolve a different copy
    // (e.g. under yalc), causing cross-instance ConstDependency errors.
    const ConstDependency = compiler.webpack.dependencies.ConstDependency

    // Generate book index files data and set up DefinePlugin
    compiler.hooks.beforeCompile.tapAsync(pluginName, async (params, callback) => {
      try {
        const outputFormats = await this.generateBookIndexFilesData()

        this.definition = JSON.stringify(outputFormats || [])

        callback()
      } catch (err) {
        callback(err)
      }
    })

    // Hook into the compilation pipeline to replace the variable
    compiler.hooks.compilation.tap(pluginName, (compilation, { normalModuleFactory }) => {
      const handler = (parser) => {
        // Tap into the parser's hook for our specific env var
        parser.hooks.expression.for(this.envVarKey).tap(pluginName, (expr) => {
          // Replace the expression `process.env.bookIndexFiles`
          // with the *content* of this.definition.
          const dep = new ConstDependency(this.definition, expr.range)
          // getLocation exists on some webpack versions, expr.loc on others.
          dep.loc = parser.getLocation ? parser.getLocation(expr) : expr.loc
          parser.state.current.addDependency(dep)
          return true // Stop parsing this branch
        })
      }

      // Hook into the javascript parser
      normalModuleFactory.hooks.parser
        .for('javascript/auto')
        .tap(pluginName, handler)
    })

    // Watch for changes (this part was already correct)
    compiler.hooks.afterCompile.tap(pluginName, (compilation) => {
      const searchDir = path.resolve(process.cwd(), this.options.searchDir)
      if (fs.existsSync(searchDir)) {
        compilation.contextDependencies.add(searchDir)

        try {
          const entries = fs.readdirSync(searchDir, { withFileTypes: true })
          entries.forEach(entry => {
            if (entry.isFile() && this.options.filePattern.test(entry.name)) {
              const fullPath = path.join(searchDir, entry.name)
              compilation.fileDependencies.add(fullPath)
            }
          })
        } catch (err) {
          console.warn(`Warning: Could not watch directory ${searchDir}:`, err.message)
        }
      }
    })
  }

  async generateBookIndexFilesData () {
    try {
      const searchDir = path.resolve(process.cwd(), this.options.searchDir)
      const outputFormats = []

      if (!fs.existsSync(searchDir)) {
        console.warn(`Search directory not found: ${searchDir}`)
        return outputFormats
      }

      const entries = fs.readdirSync(searchDir, { withFileTypes: true })

      for (const entry of entries) {
        if (entry.isFile() && this.options.filePattern.test(entry.name)) {
          const formatMatch = entry.name.match(/^book-index-(.+)\.js$/)
          if (formatMatch) {
            outputFormats.push(formatMatch[1])
          }
        }
      }

      console.log(`✓ Found book index files for formats: [${outputFormats.join(', ')}] -> ${this.envVarKey}`)

      return outputFormats
    } catch (error) {
      console.error('Error generating book index files data:', error)
      throw error
    }
  }
}

module.exports = BookIndexFilesPlugin
