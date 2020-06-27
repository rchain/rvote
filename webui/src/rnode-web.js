// adapted from https://github.com/tgrospic/rnode-client-js/blob/master/src/rnode-web.js

// Singleton timeout handle to ensure only one execution
let GET_DATA_TIMEOUT_HANDLE

// Listen for data on `deploy signature`
export const getDataForDeploy = async ({httpUrl}, deployId, onProgress) => {
  GET_DATA_TIMEOUT_HANDLE && clearTimeout(GET_DATA_TIMEOUT_HANDLE)

  const getData = (resolve, reject) => async () => {
    const getDataUnsafe = async () => {
      // Fetch deploy by signature (deployId)
      const deploy = await fetchDeploy({httpUrl}, deployId)
      if (deploy) {
        // Deploy found (added to a block)
        const args = { depth: 1, name: { UnforgDeploy: { data: deployId } } }
        // Request for data at deploy signature (deployId)
        const { exprs } = await rnodeHttp(httpUrl, 'data-at-name', args)
        // Extract cost from deploy info
        const { cost } = deploy
        // Check deploy errors
        const {errored, systemDeployError} = deploy
        if (errored) {
          throw Error(`Deploy error when executing Rholang code.`)
        } else if (!!systemDeployError) {
          throw Error(`${systemDeployError} (system error).`)
        }
        // Return data with cost (assumes only one produce on the return channel)
        resolve({data: exprs[0], cost})
      } else {
        // Retry
        const cancel = await onProgress()
        if (!cancel) {
          GET_DATA_TIMEOUT_HANDLE && clearTimeout(GET_DATA_TIMEOUT_HANDLE)
          GET_DATA_TIMEOUT_HANDLE = setTimeout(getData(resolve, reject), 7500)
        }
      }
    }
    try { await getDataUnsafe() }
    catch (ex) { reject(ex) }
  }
  return await new Promise((resolve, reject) => {
    getData(resolve, reject)()
  })
}

const fetchDeploy = async ({httpUrl}, deployId) => {
  // Request a block with the deploy
  const block = await rnodeHttp(httpUrl, `deploy/${deployId}`)
    .catch(ex => {
      // Handle response code 400 / deploy not found
      if (ex.status !== 400) throw ex
    })
  if (block) {
    const {deploys} = await rnodeHttp(httpUrl, `block/${block.blockHash}`)
    const deploy    = deploys.find(({sig}) => sig === deployId)
    if (!deploy) // This should not be possible if block is returned
      throw Error(`Deploy is not found in the block (${block.blockHash}).`)
    // Return deploy
    return deploy
  }
}
