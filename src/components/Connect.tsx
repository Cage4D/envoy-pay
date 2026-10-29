import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { Wallet } from 'lucide-react'
import { shortAddress } from '../lib/format'

export function Connect() {
  const { address, isConnected } = useAccount()
  const { connectors, connect, isPending, error } = useConnect()
  const { disconnect } = useDisconnect()

  if (isConnected && address) {
    return (
      <button className="btn btn-ghost" onClick={() => disconnect()} title="Disconnect wallet">
        <Wallet size={16} aria-hidden />
        <span className="mono">{shortAddress(address)}</span>
      </button>
    )
  }

  const connector = connectors[0]
  return (
    <div className="connect">
      <button className="btn btn-primary" disabled={!connector || isPending} onClick={() => connector && connect({ connector })}>
        <Wallet size={16} aria-hidden />
        {isPending ? 'Check your wallet...' : 'Connect owner wallet'}
      </button>
      {error && <p className="field-error">{error.message.includes('rejected') ? 'Connection cancelled.' : 'No browser wallet found. Install one and reload.'}</p>}
    </div>
  )
}
