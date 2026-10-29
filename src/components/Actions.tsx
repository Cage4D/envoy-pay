import { useState, type ReactNode } from 'react'
import { useAccount } from 'wagmi'
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, TriangleAlert } from 'lucide-react'
import { formatUnits, isAddress, type Address } from 'viem'
import { appConfig, explorerTxUrl } from '../config'
import * as actions from '../lib/actions'
import { formatUsdc, parseUsdc } from '../lib/format'
import { useTx, type TxStep } from '../hooks/useTx'
import type { VaultState } from '../hooks/useVaultState'

const UNITS = { minutes: 60, hours: 3600, days: 86400 } as const

function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="action">
      <h2>{title}</h2>
      {hint && <p className="muted small">{hint}</p>}
      {children}
    </div>
  )
}

function Field({ id, label, narrow, children }: { id: string; label: string; narrow?: boolean; children: ReactNode }) {
  return (
    <div className={narrow ? 'field field-narrow' : 'field'}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  )
}

export function Actions({ state, onChanged }: { state: VaultState | undefined; onChanged: () => void }) {
  const { address, isConnected } = useAccount()
  const { status, busy, run, dismiss } = useTx(onChanged)
  const [inputError, setInputError] = useState<string | null>(null)

  const [depositAmount, setDepositAmount] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawTo, setWithdrawTo] = useState('')
  const [agentInput, setAgentInput] = useState('')
  const [payeeInput, setPayeeInput] = useState('')
  const [capInput, setCapInput] = useState('')
  const [windowValue, setWindowValue] = useState('')
  const [windowUnit, setWindowUnit] = useState<keyof typeof UNITS>('hours')

  const isOwner = !!state && !!address && state.owner.toLowerCase() === address.toLowerCase()
  const locked = !isConnected || !isOwner || busy
  const hasAgent = !!state && state.agent !== '0x0000000000000000000000000000000000000000'

  function start(event: { preventDefault(): void }, build: () => TxStep[] | string) {
    event.preventDefault()
    dismiss()
    setInputError(null)
    const result = build()
    if (typeof result === 'string') {
      setInputError(result)
      return
    }
    void run(result)
  }

  const step = (label: string, send: TxStep['send']): TxStep => ({ label, send })

  const parseAddress = (value: string): Address | null => (isAddress(value.trim()) ? (value.trim() as Address) : null)

  return (
    <section className="card">
      <div className="hero-top">
        <p className="label">Owner actions</p>
        {isConnected && state && !isOwner && <span className="pill pill-red">
            <TriangleAlert size={14} aria-hidden /> Not the owner wallet
          </span>}
      </div>
      {!isConnected && <p className="muted">Connect the owner wallet to make changes.</p>}
      {isConnected && state && !isOwner && (
        <p className="muted">Only the vault owner can make changes. Switch to the owner wallet to enable these actions.</p>
      )}

      <div aria-live="polite" aria-atomic="false">
        {status.phase === 'wallet' && (
          <p className="banner">
            <Loader2 size={16} className="spin" aria-hidden /> Confirm "{status.label}" in your wallet.
          </p>
        )}
        {status.phase === 'confirming' && (
          <p className="banner">
            <Loader2 size={16} className="spin" aria-hidden /> Waiting for "{status.label}" to confirm.{' '}
            <a className="link" href={explorerTxUrl(status.hash)} target="_blank" rel="noopener noreferrer">
              View transaction <ExternalLink size={12} aria-hidden />
            </a>
          </p>
        )}
        {status.phase === 'success' && (
          <p className="banner banner-ok">
            <CheckCircle2 size={16} aria-hidden /> "{status.label}" confirmed.{' '}
            <a className="link" href={explorerTxUrl(status.hash)} target="_blank" rel="noopener noreferrer">
              View transaction <ExternalLink size={12} aria-hidden />
            </a>
          </p>
        )}
        {status.phase === 'error' && (
          <p className="banner banner-err">
            <AlertCircle size={16} aria-hidden /> {status.message}
          </p>
        )}
        {inputError && (
          <p className="banner banner-err">
            <AlertCircle size={16} aria-hidden /> {inputError}
          </p>
        )}
      </div>

      <Section
        title="Deposit USDC"
        hint={state ? `Your wallet: ${formatUsdc(state.walletUsdc)} USDC. Approves the vault first when needed.` : undefined}
      >
        <form
          className="row"
          onSubmit={(e) =>
            start(e, () => {
              const amount = parseUsdc(depositAmount)
              if (amount === null) return 'Enter a deposit amount greater than zero, for example 5 or 2.5.'
              if (state && amount > state.walletUsdc)
                return `Your wallet only holds ${formatUsdc(state.walletUsdc)} USDC. Get test USDC from the Arc Studio sidebar.`
              const steps: TxStep[] = []
              if (!state || state.allowance < amount) {
                steps.push(step('Approve USDC', (w, a) => actions.approveUsdc(w, a, amount)))
              }
              steps.push(step('Deposit', (w, a) => actions.deposit(w, a, amount)))
              return steps
            })
          }
        >
          <Field id="deposit-amount" label="Deposit amount (USDC)">
            <input id="deposit-amount" inputMode="decimal" placeholder="Amount in USDC" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} disabled={locked} />
          </Field>
          <button className="btn btn-primary" disabled={locked}>
            Approve and deposit
          </button>
        </form>
      </Section>

      <Section title="Withdraw USDC" hint="Always available, even while paused. Leave the recipient empty to send to your wallet.">
        <form
          className="stack"
          onSubmit={(e) =>
            start(e, () => {
              const amount = parseUsdc(withdrawAmount)
              if (amount === null) return 'Enter a withdrawal amount greater than zero.'
              const to = withdrawTo.trim() === '' ? (address ?? null) : parseAddress(withdrawTo)
              if (!to) return 'Enter a valid recipient address (0x...).'
              return [step('Withdraw', (w, a) => actions.withdraw(w, a, to, amount))]
            })
          }
        >
          <div className="row">
            <Field id="withdraw-amount" label="Withdraw amount (USDC)">
            <input id="withdraw-amount" inputMode="decimal" placeholder="Amount in USDC" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} disabled={locked} />
          </Field>
            <button
              type="button"
              className="btn btn-chip"
              disabled={locked || !state}
              onClick={() => state && setWithdrawAmount(formatUnits(state.vaultBalance, appConfig.usdcDecimals))}
            >
              Max
            </button>
          </div>
          <div className="row">
            <Field id="withdraw-to" label="Recipient (optional)">
            <input id="withdraw-to" placeholder="Recipient (optional)" value={withdrawTo} onChange={(e) => setWithdrawTo(e.target.value)} disabled={locked} />
          </Field>
            <button className="btn btn-primary" disabled={locked}>
              Withdraw
            </button>
          </div>
        </form>
      </Section>

      <Section title="Agent" hint="One agent at a time. Setting or revoking the agent resets the spending window.">
        <form
          className="row"
          onSubmit={(e) =>
            start(e, () => {
              const agent = parseAddress(agentInput)
              if (!agent) return 'Enter a valid agent address (0x...).'
              return [step('Set agent', (w, a) => actions.setAgent(w, a, agent))]
            })
          }
        >
          <Field id="agent-address" label="Agent address">
            <input id="agent-address" placeholder="Agent address (0x...)" value={agentInput} onChange={(e) => setAgentInput(e.target.value)} disabled={locked} />
          </Field>
          <button className="btn btn-primary" disabled={locked}>
            Set agent
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={locked || !hasAgent}
            onClick={(e) => start(e, () => [step('Revoke agent', (w, a) => actions.revokeAgent(w, a))])}
          >
            Revoke
          </button>
        </form>
      </Section>

      <Section title="Payees" hint="The agent can only pay allowlisted addresses.">
        <form
          className="row"
          onSubmit={(e) =>
            start(e, () => {
              const payee = parseAddress(payeeInput)
              if (!payee) return 'Enter a valid payee address (0x...).'
              return [step('Add payee', (w, a) => actions.setPayee(w, a, payee, true))]
            })
          }
        >
          <Field id="payee-address" label="Payee address">
            <input id="payee-address" placeholder="Payee address (0x...)" value={payeeInput} onChange={(e) => setPayeeInput(e.target.value)} disabled={locked} />
          </Field>
          <button className="btn btn-primary" disabled={locked}>
            Add
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={locked}
            onClick={(e) =>
              start(e, () => {
                const payee = parseAddress(payeeInput)
                if (!payee) return 'Enter the payee address (0x...) you want to remove.'
                return [step('Remove payee', (w, a) => actions.setPayee(w, a, payee, false))]
              })
            }
          >
            Remove
          </button>
        </form>
      </Section>

      <Section title="Spending cap" hint="Maximum USDC the agent can pay per window. Changing it does not reset what was already spent.">
        <form
          className="row"
          onSubmit={(e) =>
            start(e, () => {
              const cap = parseUsdc(capInput)
              if (cap === null) return 'Enter a cap greater than zero, for example 5.'
              return [step('Set cap', (w, a) => actions.setCap(w, a, cap))]
            })
          }
        >
          <Field id="cap-amount" label="Cap (USDC)">
            <input id="cap-amount" inputMode="decimal" placeholder="Cap in USDC" value={capInput} onChange={(e) => setCapInput(e.target.value)} disabled={locked} />
          </Field>
          <button className="btn btn-primary" disabled={locked}>
            Set cap
          </button>
        </form>
      </Section>

      <Section title="Window length" hint="Changing the window length resets the window: spent goes back to zero and the agent gets a fresh full cap.">
        <form
          className="row"
          onSubmit={(e) =>
            start(e, () => {
              const value = Number(windowValue)
              const seconds = value * UNITS[windowUnit]
              if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(seconds)) return 'Enter a window length greater than zero.'
              if (seconds > 365 * 86400) return 'The window can be at most 365 days.'
              return [step('Set window length', (w, a) => actions.setWindowDuration(w, a, BigInt(seconds)))]
            })
          }
        >
          <Field id="window-length" label="Length">
            <input id="window-length" inputMode="decimal" placeholder="Length" value={windowValue} onChange={(e) => setWindowValue(e.target.value)} disabled={locked} />
          </Field>
          <Field id="window-unit" label="Unit" narrow>
            <select id="window-unit" value={windowUnit} onChange={(e) => setWindowUnit(e.target.value as keyof typeof UNITS)} disabled={locked}>
            <option value="minutes">minutes</option>
            <option value="hours">hours</option>
            <option value="days">days</option>
            </select>
          </Field>
          <button className="btn btn-primary" disabled={locked}>
            Set window
          </button>
        </form>
      </Section>

      <Section title="Emergency pause" hint="Stops all agent payments. Deposits and withdrawals keep working.">
        <button
          className={state?.paused ? 'btn btn-primary' : 'btn btn-danger'}
          disabled={locked || !state}
          onClick={(e) => start(e, () => [step(state?.paused ? 'Unpause' : 'Pause', (w, a) => actions.setPaused(w, a, !state?.paused))])}
        >
          {state?.paused ? 'Unpause vault' : 'Pause vault'}
        </button>
      </Section>
    </section>
  )
}
