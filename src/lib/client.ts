import { createPublicClient, http } from 'viem'
import { chain, appConfig } from '../config'

/** Read-only client used for every chain read in the dashboard. */
export const publicClient = createPublicClient({
  chain,
  transport: http(appConfig.rpcUrl),
})
