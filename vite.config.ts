import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { appConfig } from './src/config.ts'

// Same-origin RPC: the browser calls /rpc and the dev/preview server forwards it upstream.
// In production, vercel.json does the same with a rewrite.
const rpcProxy = {
  '/rpc': {
    target: appConfig.upstreamRpcUrl,
    changeOrigin: true,
    rewrite: () => '/',
  },
}

export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173, allowedHosts: true, proxy: rpcProxy },
  preview: { proxy: rpcProxy },
})
