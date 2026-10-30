import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Ban, Check, ExternalLink } from 'lucide-react'
import { REJECT_REASONS } from '../abi'
import { appConfig, explorerTxUrl } from '../config'
import { formatUsdc, shortAddress } from '../lib/format'
import type { FeedEvent } from '../hooks/useVaultLogs'

const PAGE_SIZE = 10

type Filter = 'all' | 'executed' | 'rejected'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'executed', label: 'Executed' },
  { value: 'rejected', label: 'Rejected' },
]

export function Feed({
  events,
  progress,
  error,
}: {
  events: FeedEvent[]
  progress: { scanned: bigint; head: bigint } | null
  error: string | null
}) {
  const catchingUp = progress !== null && progress.scanned < progress.head

  const [filter, setFilter] = useState<Filter>('all')
  const [visible, setVisible] = useState(PAGE_SIZE)
  const countRef = useRef<HTMLParagraphElement>(null)
  const refocusCount = useRef(false)

  const filtered = filter === 'all' ? events : events.filter((event) => event.kind === filter)
  const shown = filtered.slice(0, visible)
  const allShown = shown.length >= filtered.length
  const noun = filter === 'all' ? 'events' : `${filter} events`

  function changeFilter(next: Filter) {
    setFilter(next)
    setVisible(PAGE_SIZE)
  }

  function showMore() {
    refocusCount.current = true
    setVisible((current) => current + PAGE_SIZE)
  }

  // The button keeps focus while it stays on screen. When this click reveals the last events the
  // button disappears, so focus moves to the count line instead of being lost.
  useEffect(() => {
    if (refocusCount.current && allShown) countRef.current?.focus()
    refocusCount.current = false
  }, [visible, allShown])

  return (
    <section className="card">
      <div className="hero-top">
        <p className="label">Live payment feed</p>
        <span className="muted small tnum">
          {progress === null
            ? 'Starting...'
            : catchingUp
              ? `Scanning blocks ${progress.scanned.toString()} of ${progress.head.toString()}`
              : `Up to block ${progress.scanned.toString()}`}
        </span>
      </div>
      {error && <p className="field-error" role="status">Could not read events right now. Retrying.</p>}
      <div className="filters" role="group" aria-label="Filter events">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            className="btn btn-chip"
            aria-pressed={filter === option.value}
            onClick={() => changeFilter(option.value)}
          >
            {filter === option.value && <Check size={16} aria-hidden />}
            {option.label}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="muted">
          {filter !== 'all'
            ? `No ${filter} payments yet`
            : catchingUp
              ? 'Looking through recent blocks...'
              : 'No payments yet. Activity appears here when the agent pays or is rejected.'}
        </p>
      ) : (
        <ul className="feed">
          {shown.map((event) => {
            const rejected = event.kind === 'rejected'
            const reason = rejected && event.reason !== undefined ? (REJECT_REASONS[event.reason] ?? `Unknown (${event.reason})`) : null
            return (
              <li key={`${event.txHash}-${event.logIndex}`} className="feed-row">
                <span className={rejected ? 'dot dot-red' : 'dot dot-green'} aria-hidden>
                  {rejected ? <Ban size={14} /> : <Check size={14} />}
                </span>
                <div className="feed-main">
                  <p>
                    <strong>{rejected ? 'Rejected' : 'Paid'}</strong>{' '}
                    <span className="tnum">{formatUsdc(event.amount)} USDC</span> to{' '}
                    <span className="mono" title={event.payee}>
                      {shortAddress(event.payee)}
                    </span>
                  </p>
                  <p className="muted small">
                    {reason ? `Reason ${event.reason}: ${reason}` : 'Executed by the agent'} · block {event.blockNumber.toString()}
                  </p>
                </div>
                <a
                  className="icon-link"
                  href={explorerTxUrl(event.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="View transaction on the explorer"
                >
                  <ExternalLink size={16} aria-hidden />
                </a>
              </li>
            )
          })}
        </ul>
      )}
      <div className="feed-footer" aria-live="polite" aria-atomic="true">
        {filtered.length > 0 && (
          <p className="muted small tnum feed-count" ref={countRef} tabIndex={-1}>
            Showing {shown.length} of {filtered.length} {noun}
          </p>
        )}
        {!allShown && (
          <button type="button" className="btn btn-ghost" onClick={showMore}>
            Show {PAGE_SIZE} more
          </button>
        )}
      </div>
      <p className="muted small">
        <ArrowUpRight size={12} aria-hidden /> Polls {appConfig.maxRangesPerPoll} ranges of {appConfig.logRangeBlocks.toString()} blocks every{' '}
        {appConfig.pollIntervalMs / 1000}s.
      </p>
    </section>
  )
}
