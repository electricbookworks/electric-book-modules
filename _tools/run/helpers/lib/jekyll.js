const spawn = require('cross-spawn')
const logProcess = require('./logProcess.js')
const configString = require('./configString.js')
const configsObject = require('./configsObject.js')
const jekyllSwitches = require('./jekyllSwitches.js')
const extraExcludesConfig = require('./extraExcludesConfig.js')
const deployTypeConfig = require('./deployTypeConfig.js')

// Run Jekyll
async function jekyll (argv) {
  // Use 'build' unless we're starting a webserver
  let command = 'build'
  if (!argv.dontserve && argv.format === 'web' && argv._[0] === 'output') {
    command = 'serve'
  }

  let baseurl = ''

  // The baseurl is only relevant for web, and can break other outputs.
  if (argv.format === 'web') {
    if (argv.baseurl !== null) {
      // A baseurl passed as argv with CLI trumps Jekyll config
      baseurl = argv.baseurl
    } else if (configsObject(argv).baseurl) {
      // Get the baseurl from Jekyll config
      baseurl = configsObject(argv).baseurl
    }
    // Ensure baseurl string starts with a slash
    if (baseurl !== '' && baseurl.indexOf('/') !== 0) {
      baseurl = '/' + baseurl
    }
  }

  // Build the string of config files.
  // We need the configs string passed to argv
  // plus any auto-generated excludes config
  let configs = configString(argv)
  const extraConfigs = await extraExcludesConfig(argv)
  if (extraConfigs) {
    configs += ',' + extraConfigs
  }

  // Expose the deploy type to Jekyll as `site.deploy-type`
  const deployTypeConfigFile = await deployTypeConfig(argv)
  if (deployTypeConfigFile) {
    configs += ',' + deployTypeConfigFile
  }

  let destination = '_site' + baseurl
  if (argv.destination) {
    destination = argv.destination.endsWith('/') ? argv.destination.slice(0, -1) : argv.destination
    destination = destination + baseurl
  }

  try {
    console.log('Running Jekyll with command: ' +
              'bundle exec jekyll ' + command +
              ' --config="' + configString(argv) + '"' +
              ' --baseurl="' + baseurl + '"' +
              ' ' + jekyllSwitches(argv).join(' ') +
              ` ${destination || argv.deploy ? '--destination="' + destination + '"' : ''}`)

    // Create an array of arguments to pass to spawn()
    const jekyllSpawnArgs = [
      'exec', 'jekyll', command,
      '--config', configs,
      '--baseurl', baseurl
    ]

    if (destination || argv.deploy) {
      jekyllSpawnArgs.push('--destination', destination)
    }

    // Add each of the switches to the args array
    jekyllSwitches(argv).forEach(function (switchString) {
      jekyllSpawnArgs.push(switchString)
    })

    // Create a child process
    const jekyllProcess = spawn('bundle', jekyllSpawnArgs)
    const result = await logProcess(jekyllProcess, 'Jekyll')

    // If Jekyll fails (i.e. exit code 1), kill this process.
    // We don't want to try to render a PDF if Jekyll didn't build.
    if (result === 1) {
      console.log('Jekyll could not complete its build. Exiting.')
      process.exit()
    }
    return result
  } catch (error) {
    console.log(error)
  }
}

module.exports = jekyll
