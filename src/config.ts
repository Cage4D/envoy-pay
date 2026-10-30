import { defineChain, type Address } from 'viem'

/**
 * Single source of truth for every chain detail the dashboard uses.
 * No secrets belong here: this file ships to the browser.
 *
 * Pick the network with VITE_NETWORK ('testnet' or 'mainnet'). It defaults to 'testnet'.
 * Starting the app on a network that still has a null value throws a startup error naming the
 * missing fields.
 */
export type NetworkName = 'testnet' | 'mainnet'

type NetworkEntry = {
  chainId: number | null
  chainName: string | null
  /**
   * Same-origin path the browser calls for RPC, so browsers (Firefox, Brave) never make a
   * cross-origin request. The Vite dev/preview proxy and the vercel.json rewrite forward it to
   * upstreamRpcUrl. The paths are '/rpc/testnet' and '/rpc/mainnet'.
   */
  rpcPath: string | null
  /**
   * The real RPC endpoint. Used by the proxies, and as the URL wallets are given when they add the
   * chain. Keep it identical to the matching rewrite destination in vercel.json.
   */
  upstreamRpcUrl: string | null
  explorerBaseUrl: string | null
  vaultAddress: Address | null
  /** USDC ERC-20 view (6 decimals). All balances and amounts in the app use this view. */
  usdcAddress: Address | null
  /** Block the vault was deployed in. Event scanning starts here. */
  vaultDeploymentBlock: bigint | null
}

export const networks: Record<NetworkName, NetworkEntry> = {
  testnet: {
    chainId: 5042002,
    chainName: 'Arc Testnet',
    rpcPath: '/rpc/testnet',
    upstreamRpcUrl: 'https://rpc.testnet.arc.io',
    explorerBaseUrl: 'https://explorer.testnet.arc.io',
    vaultAddress: '0x97f975915cd09eed8d6ff2d0eae3aecfad036de0',
    usdcAddress: '0x3600000000000000000000000000000000000000',
    vaultDeploymentBlock: 69661479n,
  },
  // Intentionally empty. Fill in every field yourself, after your own review (see DEPLOYMENTS.md).
  mainnet: {
    chainId: null,
    chainName: null,
    rpcPath: null,
    upstreamRpcUrl: null,
    explorerBaseUrl: null,
    vaultAddress: null,
    usdcAddress: null,
    vaultDeploymentBlock: null,
  },
}

const FIELDS = [
  'chainId',
  'chainName',
  'rpcPath',
  'upstreamRpcUrl',
  'explorerBaseUrl',
  'vaultAddress',
  'usdcAddress',
  'vaultDeploymentBlock',
] as const satisfies readonly (keyof NetworkEntry)[]

type ResolvedNetwork = { [K in keyof NetworkEntry]: NonNullable<NetworkEntry[K]> }

/** Returns the entry for a network, or throws a clear error naming every missing (null) field. */
export function resolveNetwork(name: string): ResolvedNetwork & { name: NetworkName } {
  if (name !== 'testnet' && name !== 'mainnet') {
    throw new Error(`VITE_NETWORK must be "testnet" or "mainnet", but it is "${name}".`)
  }
  const entry = networks[name]
  const missing = FIELDS.filter((field) => entry[field] === null)
  if (missing.length > 0) {
    throw new Error(
      `The "${name}" network is not configured. Missing in networks.${name} (src/config.ts): ${missing.join(', ')}. ` +
        `Fill them in, or run with VITE_NETWORK=testnet.`,
    )
  }
  return { name, ...(entry as ResolvedNetwork) }
}

// import.meta.env exists in the browser bundle; the Vite config also loads this file under Node.
const requested = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_NETWORK?.trim()
const active = resolveNetwork(requested || 'testnet')

export const appConfig = {
  network: active.name,
  chainId: active.chainId,
  chainName: active.chainName,
  rpcPath: active.rpcPath,
  upstreamRpcUrl: active.upstreamRpcUrl,
  /**
   * What the browser actually calls: the same-origin rpcPath. viem needs an absolute URL, hence
   * window.location.origin.
   */
  rpcUrl: `${typeof window === 'undefined' ? '' : window.location.origin}${active.rpcPath}`,
  explorerBaseUrl: active.explorerBaseUrl,
  /** Arc's gas coin is USDC itself (18-decimal native view, used for gas only). */
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },

  vaultAddress: active.vaultAddress,
  usdcAddress: active.usdcAddress,
  usdcDecimals: 6,
  vaultDeploymentBlock: active.vaultDeploymentBlock,

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
