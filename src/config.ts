import { defineChain, type Address } from 'viem'

/**
 * Single source of truth for every chain detail the dashboard uses.
 * To point the dashboard at another network or another vault, edit this file only.
 * No secrets belong here: this file ships to the browser.
 */
export const appConfig = {
  chainId: 5042002,
  chainName: 'Arc Testnet',
  /**
   * The real RPC endpoint. Only used by the dev/preview proxy in vite.config.ts and as the URL
   * wallets are given when they add the chain. When switching networks, update this together
   * with the rewrite destination in vercel.json: they must always point at the same endpoint.
   */
  upstreamRpcUrl: 'https://rpc.testnet.arc.io',
  /**
   * What the browser actually calls: a same-origin path, so browsers (Firefox, Brave) never make a
   * cross-origin request. Served by the Vite proxy in dev and the vercel.json rewrite in production.
   * viem needs an absolute URL, hence window.location.origin.
   */
  rpcUrl: `${typeof window === 'undefined' ? '' : window.location.origin}/rpc`,
  explorerBaseUrl: 'https://explorer.testnet.arc.io',
  /** Arc's gas coin is USDC itself (18-decimal native view, used for gas only). */
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },

  vaultAddress: '0x97f975915cd09eed8d6ff2d0eae3aecfad036de0' as Address,
  /** USDC ERC-20 view (6 decimals). All balances and amounts in the app use this view. */
  usdcAddress: '0x3600000000000000000000000000000000000000' as Address,
  usdcDecimals: 6,

  /** Block the vault was deployed in. Event scanning starts here. */
  vaultDeploymentBlock: 69661479n,

  /** Event polling: small block ranges, a few per poll. */
  logRangeBlocks: 2000n,
  maxRangesPerPoll: 5,
  pollIntervalMs: 5000,
  feedLimit: 50,
}

export const chain = defineChain({
  id: appConfig.chainId,
  name: appConfig.chainName,
  nativeCurrency: appConfig.nativeCurrency,
  // Wallets get the real endpoint when adding the chain; the app's own reads use appConfig.rpcUrl.
  rpcUrls: { default: { http: [appConfig.upstreamRpcUrl] } },
  blockExplorers: { default: { name: 'Explorer', url: appConfig.explorerBaseUrl } },
})

export const explorerTxUrl = (hash: string) => `${appConfig.explorerBaseUrl}/tx/${hash}`
export const explorerAddressUrl = (address: string) => `${appConfig.explorerBaseUrl}/address/${address}`
