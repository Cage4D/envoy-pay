import { createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { chain, appConfig } from './config'

/** Browser-wallet only: the connected wallet signs, the app never touches a key. */
export const wagmiConfig = createConfig({
  chains: [chain],
  connectors: [injected()],
  transports: { [chain.id]: http(appConfig.rpcUrl) },
})
