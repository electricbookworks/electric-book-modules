const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')

const pluginName = 'WorksDataPlugin'

class WorksDataPlugin {
  constructor (options = {}) {
    this.options = {
      worksDir: options.worksDir || '_data/works',
      envVar: options.envVar || 'works',
      ...options
    }

    // This is the variable key we'll look for in code
    this.envVarKey = `process.env.${this.options.envVar}`

    // This will store the stringified data
    this.definition = 'null' // Default to null, as the original code does
  }

  apply (compiler) {
    // Use the ConstDependency from the same webpack instance that is running
    // the build. Requiring 'webpack' directly can resolve a different copy
    // (e.g. under yalc), causing cross-instance ConstDependency errors.
    const ConstDependency = compiler.webpack.dependencies.ConstDependency

    // Generate works data
    compiler.hooks.beforeCompile.tapAsync(pluginName, async (params, callback) => {
      try {
        const worksData = await this.generateWorksData()

        this.definition = worksData ? JSON.stringify(worksData) : 'null'

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
          // Replace the expression `process.env.works`
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
      const worksDir = path.resolve(process.cwd(), this.options.worksDir)
      if (fs.existsSync(worksDir)) {
        this.addDirectoryToWatch(compilation, worksDir)
      }
    })
  }

  addDirectoryToWatch (compilation, dir) {
    compilation.contextDependencies.add(dir)
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      entries.forEach(entry => {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          this.addDirectoryToWatch(compilation, fullPath)
        } else if (entry.name.endsWith('.yml') || entry.name.endsWith('.yaml')) {
          compilation.fileDependencies.add(fullPath)
        }
      })
    } catch (err) {
      console.warn(`Warning: Could not watch directory ${dir}:`, err.message)
    }
  }

  async generateWorksData () {
    try {
      const worksDir = path.resolve(process.cwd(), this.options.worksDir)
      const works = await this.scanWorksDirectory(worksDir)

      // Prune works data to only include properties used by
      // nav.js and search-results.js, reducing bundle size.
      const output = process.env.output || 'web'
      const prunedWorks = this.pruneWorksData(works, output)

      // Use the class property for the log message
      console.log(`✓ Generated works data for environment variable: ${this.envVarKey}`)

      return prunedWorks
    } catch (error) {
      console.error('Error generating works data:', error)
      throw error
    }
  }

  // Keys to strip from all levels of the data
  static excludedKeys = new Set(['glossary', 'bibliography'])

  /**
   * Prune works data to only include properties consumed by client code.
   * Keeps: title, published, and products limited to the current output
   * and 'web' (fallback), each with only nav, start-page, and files.
   * Also strips glossary and bibliography at all levels.
   */
  pruneWorksData (works, output) {
    if (!works) return works

    const pruned = {}
    for (const [bookName, bookData] of Object.entries(works)) {
      pruned[bookName] = this.pruneBookData(bookData, output)
    }

    // Deep-strip excluded keys from all levels, including inside nav trees
    return this.deepStripKeys(pruned)
  }

  pruneBookData (bookData, output) {
    if (!bookData || typeof bookData !== 'object') return bookData

    const pruned = {}
    for (const [key, value] of Object.entries(bookData)) {
      if (WorksDataPlugin.excludedKeys.has(key)) continue

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        // If this entry has 'products' or 'title', it's variant data
        if ('products' in value || 'title' in value) {
          pruned[key] = this.pruneVariantData(value, output)
        } else {
          // It's a language directory containing variant objects
          pruned[key] = this.pruneBookData(value, output)
        }
      } else {
        pruned[key] = value
      }
    }
    return pruned
  }

  /**
   * Recursively remove excluded keys from any level of a data structure.
   */
  deepStripKeys (data) {
    if (Array.isArray(data)) {
      return data.map(item => this.deepStripKeys(item))
    }
    if (data && typeof data === 'object') {
      const cleaned = {}
      for (const [key, value] of Object.entries(data)) {
        if (WorksDataPlugin.excludedKeys.has(key)) continue
        cleaned[key] = this.deepStripKeys(value)
      }
      return cleaned
    }
    return data
  }

  pruneVariantData (variantData, output) {
    const pruned = {}

    // Keep only title and published
    if (variantData.title !== undefined) pruned.title = variantData.title
    if (variantData.published !== undefined) pruned.published = variantData.published

    // Keep only relevant products with only nav, start-page, and files
    if (variantData.products) {
      pruned.products = {}
      const productKeys = new Set([output, 'web'])
      for (const productKey of productKeys) {
        if (variantData.products[productKey]) {
          pruned.products[productKey] = this.pruneProductData(variantData.products[productKey])
        }
      }
    }

    return pruned
  }

  pruneProductData (productData) {
    if (!productData || typeof productData !== 'object') return productData

    const pruned = {}
    if (productData.nav !== undefined) pruned.nav = productData.nav
    if (productData['start-page'] !== undefined) pruned['start-page'] = productData['start-page']
    if (productData.files !== undefined) pruned.files = productData.files
    return pruned
  }

  async scanWorksDirectory (worksDir) {
    const works = {}
    if (!fs.existsSync(worksDir)) {
      console.warn(`Works directory not found: ${worksDir}`)
      return works
    }
    const bookDirs = fs.readdirSync(worksDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name)

    for (const bookName of bookDirs) {
      const bookDir = path.join(worksDir, bookName)
      works[bookName] = await this.scanBookDirectory(bookDir)
    }
    return works
  }

  async scanBookDirectory (bookDir) {
    const bookData = {}
    const directFiles = fs.readdirSync(bookDir, { withFileTypes: true })
      .filter(dirent => dirent.isFile() && (dirent.name.endsWith('.yml') || dirent.name.endsWith('.yaml')))
      .map(dirent => dirent.name)

    for (const fileName of directFiles) {
      const filePath = path.join(bookDir, fileName)
      const variantName = path.basename(fileName, path.extname(fileName))
      try {
        const content = fs.readFileSync(filePath, 'utf8')
        const data = yaml.load(content)
        bookData[variantName] = data
      } catch (error) {
        console.warn(`Warning: Could not parse ${filePath}:`, error.message)
      }
    }

    const languageDirs = fs.readdirSync(bookDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name)

    for (const languageCode of languageDirs) {
      const languageDir = path.join(bookDir, languageCode)
      const languageFiles = fs.readdirSync(languageDir, { withFileTypes: true })
        .filter(dirent => dirent.isFile() && (dirent.name.endsWith('.yml') || dirent.name.endsWith('.yaml')))
        .map(dirent => dirent.name)

      if (languageFiles.length > 0) {
        bookData[languageCode] = {}
        for (const fileName of languageFiles) {
          const filePath = path.join(languageDir, fileName)
          const variantName = path.basename(fileName, path.extname(fileName))
          try {
            const content = fs.readFileSync(filePath, 'utf8')
            const data = yaml.load(content)
            bookData[languageCode][variantName] = data
          } catch (error) {
            console.warn(`Warning: Could not parse ${filePath}:`, error.message)
          }
        }
      }
    }
    return bookData
  }
}

module.exports = WorksDataPlugin
