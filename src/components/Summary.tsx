import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import type { Address } from 'viem'
import { appConfig, explorerAddressUrl } from '../config'
import { formatDuration, formatUsdc, shortAddress } from '../lib/format'
import type { VaultState } from '../hooks/useVaultState'

const ZERO = '0x0000000000000000000000000000000000000000'

function AddressLink({ address }: { address: string }) {
  return (
    <a className="mono link" href={explorerAddressUrl(address)} target="_blank" rel="noopener noreferrer" title={address}>
      {shortAddress(address)}
      <ExternalLink size={12} aria-hidden />
    </a>
  )
}

export function Summary({
  state,
  loading,
  error,
  payees,
}: {
  state: VaultState | undefined
  loading: boolean
  error: Error | null
  payees: Address[]
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  if (!state) {
    return (
      <section className="card hero">
        <p className="label">Vault balance</p>
        <p className="hero-number">{loading ? '...' : '--'}</p>
        {error && (
          <>
            <p className="field-error">Could not read the vault. Check the RPC URL and vault address in src/config.ts.</p>
            <details className="details">
              <summary>Show error details</summary>
              <pre>{error.message}</pre>
            </details>
          </>
        )}
      </section>
    )
  }

  const windowActive = state.windowEnd > 0n
  const spentNow = windowActive ? state.spent : 0n
  const usedPct = state.cap > 0n ? Number((spentNow * 100n) / state.cap) : 0
  const chainNow = Number(state.chainTime) + (now - state.fetchedAtMs) / 1000
  const secondsLeft = windowActive ? Number(state.windowEnd) - chainNow : 0
  const agentSet = state.agent.toLowerCase() !== ZERO

  return (
    <>
      <section className="card hero">
        <div className="hero-top">
          <p className="label">Vault balance</p>
          <span className={state.paused ? 'pill pill-red' : 'pill pill-green'}>{state.paused ? 'Paused' : 'Active'}</span>
        </div>
        <p className="hero-number tnum">
          {formatUsdc(state.vaultBalance)} <span className="hero-unit">USDC</span>
        </p>
        <div className="meter" role="img" aria-label={`${usedPct}% of the cap used in this window`}>
          <div className="meter-fill" style={{ width: `${Math.min(100, usedPct)}%` }} />
        </div>
        <p className="subline tnum">
          {formatUsdc(spentNow)} spent of {formatUsdc(state.cap)} cap this window
        </p>
      </section>

      <section className="card">
        <dl className="stats">
          <div>
            <dt>Remaining this window</dt>
            <dd className="tnum">{formatUsdc(state.remaining)} USDC</dd>
          </div>
          <div>
            <dt>Window resets in</dt>
            <dd className="tnum">{windowActive ? (secondsLeft > 0 ? formatDuration(secondsLeft) : 'resetting') : 'No active window'}</dd>
          </div>
          <div>
            <dt>Cap per window</dt>
            <dd className="tnum">{formatUsdc(state.cap)} USDC</dd>
          </div>
          <div>
            <dt>Window length</dt>
            <dd className="tnum">{formatDuration(Number(state.windowDuration))}</dd>
          </div>
          <div>
            <dt>Agent</dt>
            <dd>{agentSet ? <AddressLink address={state.agent} /> : 'None registered'}</dd>
          </div>
          <div>
            <dt>Owner</dt>
            <dd>
              <AddressLink address={state.owner} />
            </dd>
          </div>
        </dl>
      </section>

      <section className="card">
        <p className="label">Allowlisted payees</p>
        {payees.length === 0 ? (
          <p className="muted">No payees yet. Payments are rejected until you add one.</p>
        ) : (
          <ul className="list">
            {payees.map((payee) => (
              <li key={payee}>
                <AddressLink address={payee} />
              </li>
            ))}
          </ul>
        )}
        <p className="muted small">
          Vault <AddressLink address={appConfig.vaultAddress} />
        </p>
      </section>
    </>
  )
}
