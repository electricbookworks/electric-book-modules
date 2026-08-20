const fs = require('fs')
const path = require('path')

const pluginName = 'BookIndexFilesPlugin'

// This plugin replaces `process.env.bookIndexFiles` in client code
// with an array of all filenames in the _indexes directory. The index
// files are now split per book and language, so consumers look up the
// file they need by name and check this list before requiring it.
class BookIndexFilesPlugin {
  constructor (options = {}) {
    this.options = {
      // Directory to scan for index files
      searchDir: options.searchDir || '_indexes',
      // Environment variable name
      envVar: options.envVar || 'bookIndexFiles',
      ...options
    }

    // This is the variable key we'll look for in code
    this.envVarKey = `process.env.${this.options.envVar}`

    // This will store the stringified array of filenames
    this.definition = '[]' // Default to an empty array
  }

  apply (compiler) {
    // Use the ConstDependency from the same webpack instance that is running
    // the build. Requiring 'webpack' directly can resolve a different copy
    // (e.g. under yalc), causing cross-instance ConstDependency errors.
    const ConstDependency = compiler.webpack.dependencies.ConstDependency

    // Generate the list of index filenames and set up the replacement
    compiler.hooks.beforeCompile.tapAsync(pluginName, (params, callback) => {
      try {
        this.definition = JSON.stringify(this.indexFileNames())
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

    // Watch the directory and its files for changes
    compiler.hooks.afterCompile.tap(pluginName, (compilation) => {
      const searchDir = path.resolve(process.cwd(), this.options.searchDir)
      if (!fs.existsSync(searchDir)) {
        return
      }

      compilation.contextDependencies.add(searchDir)

      try {
        this.indexFileNames().forEach((name) => {
          compilation.fileDependencies.add(path.join(searchDir, name))
        })
      } catch (err) {
        console.warn(`Warning: Could not watch directory ${searchDir}:`, err.message)
      }
    })
  }

  // Return an array of all index filenames in the search directory.
  indexFileNames () {
    const searchDir = path.resolve(process.cwd(), this.options.searchDir)

    if (!fs.existsSync(searchDir)) {
      console.warn(`Search directory not found: ${searchDir}`)
      return []
    }

    const fileNames = fs.readdirSync(searchDir, { withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => entry.name)

    console.log(`✓ Found index files: [${fileNames.join(', ')}] -> ${this.envVarKey}`)

    return fileNames
  }
}

module.exports = BookIndexFilesPlugin
