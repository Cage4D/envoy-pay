import { ArrowUpRight, Ban, Check, ExternalLink } from 'lucide-react'
import { REJECT_REASONS } from '../abi'
import { appConfig, explorerTxUrl } from '../config'
import { formatUsdc, shortAddress } from '../lib/format'
import type { FeedEvent } from '../hooks/useVaultLogs'

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
      {events.length === 0 ? (
        <p className="muted">{catchingUp ? 'Looking through recent blocks...' : 'No payments or rejections yet.'}</p>
      ) : (
        <ul className="feed">
          {events.map((event) => {
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
      <p className="muted small">
        <ArrowUpRight size={12} aria-hidden /> Polls {appConfig.maxRangesPerPoll} ranges of {appConfig.logRangeBlocks.toString()} blocks every{' '}
        {appConfig.pollIntervalMs / 1000}s.
      </p>
    </section>
  )
}
