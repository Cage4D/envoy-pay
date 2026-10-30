import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { networks, resolveNetwork, type NetworkName } from './src/config.ts'

// Same-origin RPC: the browser calls /rpc/testnet or /rpc/mainnet and the dev/preview server forwards
// it to that network's upstreamRpcUrl. In production, vercel.json does the same with rewrites.
function proxyFor(name: NetworkName) {
  const target = networks[name].upstreamRpcUrl
  // TODO(mainnet): networks.mainnet.upstreamRpcUrl is null until you fill it in, so there is no
  // /rpc/mainnet proxy yet. Set it in src/config.ts and this entry appears automatically.
  if (!target) return {}
  return { [`/rpc/${name}`]: { target, changeOrigin: true, rewrite: () => new URL(target).pathname } }
}

const rpcProxy = { ...proxyFor('testnet'), ...proxyFor('mainnet') }

// Warn when a vercel.json rewrite destination drifts from the matching upstreamRpcUrl.
function checkVercelRewrites() {
  try {
    const { rewrites = [] } = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as {
      rewrites?: { source: string; destination: string }[]
    }
    for (const name of ['testnet', 'mainnet'] as const) {
      const upstream = networks[name].upstreamRpcUrl
      const rewrite = rewrites.find((r) => r.source === `/rpc/${name}`)
      if (upstream && rewrite?.destination !== upstream) {
        console.warn(`[config] vercel.json rewrite for /rpc/${name} (${rewrite?.destination ?? 'missing'}) does not match upstreamRpcUrl (${upstream}).`)
      }
    }
  } catch {
    console.warn('[config] Could not read vercel.json to compare the RPC rewrites.')
  }
}

export default defineConfig(({ mode }) => {
  // Fail the dev server or build early, with a clear message, if the selected network is incomplete.
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  resolveNetwork(env.VITE_NETWORK?.trim() || 'testnet')
  checkVercelRewrites()

  return {
    plugins: [react()],
    server: { host: true, port: 5173, allowedHosts: true, proxy: rpcProxy },
    preview: { proxy: rpcProxy },
  }
})
