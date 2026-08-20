const spawn = require('cross-spawn')
const logProcess = require('./logProcess.js')
const configString = require('./configString.js')

// Run Webpack
async function webpack (argv) {
  try {
    console.log('Running webpack build...')

    if (argv.debugjs) {
      console.log('Including source maps and live rebuild. Ignore size warnings.')
    }

    // Create an array of arguments to pass to spawn()
    const webpackConfig = require.resolve('../../../../_webpack/webpack.config.js')
    const webpackSpawnArgs = ['--config', webpackConfig, '--mode=production']

    if (argv.debugjs) {
      webpackSpawnArgs.push('--watch')
    }

    const configFiles = configString(argv)

    // Set environment variable
    const env = {
      ...process.env,
      output: argv.format,
      build: argv.build,
      debug: argv.debugjs,
      deployType: argv.deploytype,
      configFiles
    }

    if (argv.baseurl !== null) {
      env.baseurl = argv.baseurl
    }

    // Create a child process
    const webpackProcess = spawn('webpack', webpackSpawnArgs, { env })

    // If webpack is in watch mode, don't wait for it to complete
    // as it will run indefinitely. Just ensure it starts successfully.
    if (argv.debugjs) {
      console.log('Webpack running in watch mode. Continuing with other processes...')

      // Give webpack a moment to start and check for immediate errors
      return new Promise((resolve, reject) => {
        let hasResolved = false

        // Listen for immediate errors
        webpackProcess.on('error', (error) => {
          if (!hasResolved) {
            hasResolved = true
            console.log('Webpack failed to start:', error.message)
            reject(error)
          }
        })

        // Listen to stderr for immediate compilation errors
        webpackProcess.stderr.on('data', (data) => {
          console.log('Webpack: ' + data)
          if (!hasResolved && data.toString().includes('ERROR')) {
            hasResolved = true
            resolve(false)
          }
        })

        // Listen to stdout for successful start indication
        webpackProcess.stdout.on('data', (data) => {
          console.log('Webpack: ' + data)
          if (!hasResolved && (data.toString().includes('webpack compiled') || data.toString().includes('watching for file changes'))) {
            hasResolved = true
            resolve(true)
          }
        })

        // If no immediate errors, assume success after a short delay
        setTimeout(() => {
          if (!hasResolved) {
            hasResolved = true
            resolve(true)
          }
        }, 3000)
      })
    } else {
      // For non-watch mode, wait for completion as before
      const result = await logProcess(webpackProcess, 'Webpack')

      // If webpack fails, log error but don't kill the process
      if (result === false) {
        console.log('Webpack build failed.')
      }
      return result
    }
  } catch (error) {
    console.log(error)
    return false
  }
}

module.exports = webpack
