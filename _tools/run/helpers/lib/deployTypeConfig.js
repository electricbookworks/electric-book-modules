const fsPromises = require('fs/promises')
const yaml = require('js-yaml')

// Config to expose the deploy type to Jekyll as `site.deploy-type`
async function deployTypeConfig (argv) {
  // Create a temp config file holding the deploy-type value.
  const pathToTempDeployTypeConfig = '_output/.temp/_config.deploytype.yml'
  await fsPromises.mkdir('_output/.temp', { recursive: true })

  // Use the hyphenated `deploy-type` key so it's available as
  // `site.deploy-type` in Jekyll (matching the webpack config key).
  const deployTypeProperty = {
    'deploy-type': argv.deploytype
  }

  const deployTypeYAML = yaml.dump(deployTypeProperty)
  await fsPromises.writeFile(pathToTempDeployTypeConfig, deployTypeYAML)

  // Return the path to the new deploy-type config
  return pathToTempDeployTypeConfig
}

module.exports = deployTypeConfig
