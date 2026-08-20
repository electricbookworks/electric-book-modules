const fs = require('fs')
const path = require('path')
const webpack = require('webpack')
const yargs = require('yargs')
const WorksDataPlugin = require('./plugins/works-data-plugin')
const YamlEnvPlugin = require('./plugins/yaml-env-plugin')
const BookIndexFilesPlugin = require('./plugins/book-index-files-plugin')
const ConfigMergePlugin = require('./plugins/config-merge-plugin')
const mode = yargs.argv.mode || 'development'
const ebBuild = process.env.build || 'development'
const isWebAppOutput = process.env.output === 'web' || process.env.output === 'app'
const isPrinceOutput = process.env.output === 'print-pdf' || process.env.output === 'screen-pdf'

// Generate one webpack entry per split book-index file, using
// assets/js/entries/indexing.js as a template. Each entry requires its
// own index file and produces a matching dist bundle, e.g.
// web-mybook-es-index.js -> web-mybook-es-indexes.dist.js.
// Search indexes are excluded; they're handled separately.
function indexEntries () {
  if (!isWebAppOutput) {
    return {}
  }

  // The template lives in the engine package's assets, which aren't
  // copied into the book repo, so resolve it from the installed package
  // rather than relative to this config file.
  let template
  try {
    template = require.resolve('@electricbookworks/electric-book-modules/assets/js/entries/indexing.js')
  } catch (error) {
    return {}
  }
  const indexesDir = path.resolve(process.cwd(), '_indexes')
  if (!fs.existsSync(indexesDir)) {
    return {}
  }

  const loader = path.resolve(__dirname, 'loaders/index-entry-loader.js')
  const entries = {}

  fs.readdirSync(indexesDir)
    .filter(name => name.startsWith(`${process.env.output}-`) && name.endsWith('-index.js'))
    .forEach(name => {
      // e.g. web-mybook-es-index.js -> web-mybook-es-indexes
      const entryName = name.replace(/-index\.js$/, '-indexing')
      // The index file to require, without its .js extension.
      const fileBase = name.replace(/\.js$/, '')
      entries[entryName] = `${loader}!${template}?file=${fileBase}`
    })

  return entries
}

module.exports = {
  mode,
  entry: {
    main: path.resolve(process.cwd(), 'assets/js/main.js'),
    ...(isWebAppOutput && fs.existsSync(path.resolve(process.cwd(), 'assets/js/search.js')) && {
      search: path.resolve(process.cwd(), 'assets/js/search.js')
    }),
    ...indexEntries()
  },
  target: isPrinceOutput ? ['web', 'es5'] : 'web',
  output: {
    filename: '[name].dist.js',
    chunkFilename: (pathData) => {
      // Remove leading underscores from chunk names to avoid Jekyll ignoring them
      const name = pathData.chunk.name || pathData.chunk.id || 'chunk'
      const cleanName = String(name).replace(/^_+/, '')
      return `${cleanName}.main.dist.js`
    },
    path: path.resolve(process.cwd(), 'assets/js/dist'),
    clean: {
      keep: '.gitignore'
    },
    ...(isPrinceOutput && {
      environment: {
        arrowFunction: false,
        bigIntLiteral: false,
        const: false,
        destructuring: false,
        dynamicImport: false,
        forOf: false,
        module: false
      }
    })
  },
  optimization: {
    usedExports: true,
    sideEffects: false
  },
  module: {
    rules: [
      {
        test: /\.yml$/,
        use: 'yaml-loader'
      },
      ...(isPrinceOutput
        ? [{
            test: /\.js$/,
            use: {
              loader: 'babel-loader',
              options: {
                presets: [
                  ['@babel/preset-env', {
                    modules: false,
                    forceAllTransforms: true,
                    loose: false
                  }]
                ]
              }
            }
          }]
        : [])
    ]
  },
  resolve: {
    extensions: ['.js'],
    alias: {
      '@': path.resolve(process.cwd(), 'assets/js'),
      '@indexes': path.resolve(process.cwd(), '_indexes')
    }
  },
  plugins: [
    new ConfigMergePlugin({
      configFiles: process.env.configFiles || '_config.yml',
      envVar: 'config'
    }),
    new WorksDataPlugin({
      worksDir: '_data/works',
      envVar: 'works'
    }),
    new YamlEnvPlugin([
      {
        filePath: '_data/settings.yml',
        envVar: 'settings'
      },
      {
        filePath: '_data/locales.yml',
        envVar: 'locales'
      }
    ]),
    new BookIndexFilesPlugin({
      searchDir: '_indexes',
      envVar: 'bookIndexFiles'
    }),
    new webpack.DefinePlugin({
      'process.env.output': JSON.stringify(process.env.output || 'web'),
      'process.env.build': JSON.stringify(ebBuild),
      // Basename of the project directory (e.g. 'core-insights-2'), used as a
      // per-project fallback for scoping browser storage when no baseurl is set
      // (e.g. local dev, where every project is served from localhost).
      'process.env.projectName': JSON.stringify(path.basename(process.cwd()))
    })
  ],
  devtool: process.env.debug === 'true' ? 'eval-source-map' : false,
  stats: {
    colors: true,
    modules: false,
    children: false,
    chunks: false,
    chunkModules: false
  }
}
