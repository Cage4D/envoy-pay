import { createPublicClient, http } from 'viem'
import { chain, appConfig } from '../config'

/**
 * Read-only client used for every chain read in the dashboard (vault state, balances, payees,
 * event logs, simulations, receipts). It talks to the same-origin /rpc path over HTTP and never
 * goes through an injected wallet provider.
 */
export const publicClient = createPublicClient({
  chain,
  transport: http(appConfig.rpcUrl),
})
