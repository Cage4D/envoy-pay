import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Address, Hash } from 'viem'
import { vaultAbi } from '../abi'
import { appConfig } from '../config'
import { publicClient } from '../lib/client'

export type FeedEvent = {
  kind: 'executed' | 'rejected'
  txHash: Hash
  blockNumber: bigint
  logIndex: number
  agent: Address
  payee: Address
  amount: bigint
  /** Only for kind === 'rejected'. */
  reason?: number
}

type Stored = {
  /** Last block fully scanned, as a decimal string. */
  cursor: string
  /** Every address ever passed to PayeeUpdated (current status is read from the chain). */
  payeeCandidates: Address[]
  events: (Omit<FeedEvent, 'blockNumber' | 'amount'> & { blockNumber: string; amount: string })[]
}

const storageKey = `envoy-vault:logs:${appConfig.chainId}:${appConfig.vaultAddress.toLowerCase()}`
const startCursor = appConfig.vaultDeploymentBlock - 1n

function load(): Stored {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw) return JSON.parse(raw) as Stored
  } catch {
    // ignore a corrupt cache and rescan
  }
  return { cursor: startCursor.toString(), payeeCandidates: [], events: [] }
}

const byNewest = (a: FeedEvent, b: FeedEvent) =>
  a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : a.blockNumber > b.blockNumber ? -1 : 1

/**
 * Scans vault events in small block ranges (a few per poll) and keeps a cursor so
 * only new blocks are fetched afterwards. The cursor and results are cached in
 * localStorage so a reload does not rescan from the deployment block.
 */
export function useVaultLogs() {
  const stored = useRef<Stored>(load())
  const [events, setEvents] = useState<FeedEvent[]>(() =>
    stored.current.events
      .map((e) => ({ ...e, blockNumber: BigInt(e.blockNumber), amount: BigInt(e.amount) }))
      .sort(byNewest),
  )
  const [candidates, setCandidates] = useState<Address[]>(stored.current.payeeCandidates)
  const [progress, setProgress] = useState<{ scanned: bigint; head: bigint } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stopped = false
    let running = false

    async function tick() {
      if (running) return
      running = true
      try {
        // Stay a couple of blocks behind the tip: load-balanced RPC nodes can lag the node that reported the head.
        const head = (await publicClient.getBlockNumber()) - 2n
        let cursor = BigInt(stored.current.cursor)
        let ranges = 0
        let changed = false
        const newEvents: FeedEvent[] = []
        const newCandidates = new Set(stored.current.payeeCandidates)

        while (cursor < head && ranges < appConfig.maxRangesPerPoll && !stopped) {
          const fromBlock = cursor + 1n
          const toBlock =
            fromBlock + appConfig.logRangeBlocks - 1n < head ? fromBlock + appConfig.logRangeBlocks - 1n : head
          const logs = await publicClient.getContractEvents({
            address: appConfig.vaultAddress,
            abi: vaultAbi,
            fromBlock,
            toBlock,
            strict: true,
          })
          for (const log of logs) {
            if (log.eventName === 'PayeeUpdated') {
              newCandidates.add(log.args.payee)
              changed = true
            } else if (log.eventName === 'PaymentExecuted') {
              newEvents.push({
                kind: 'executed',
                txHash: log.transactionHash,
                blockNumber: log.blockNumber,
                logIndex: log.logIndex,
                agent: log.args.agent,
                payee: log.args.payee,
                amount: log.args.amount,
              })
            } else if (log.eventName === 'PaymentRejected') {
              newEvents.push({
                kind: 'rejected',
                txHash: log.transactionHash,
                blockNumber: log.blockNumber,
                logIndex: log.logIndex,
                agent: log.args.agent,
                payee: log.args.payee,
                amount: log.args.amount,
                reason: log.args.reason,
              })
            }
          }
          cursor = toBlock
          ranges += 1
        }

        if (stopped) return
        setProgress({ scanned: cursor, head })
        setError(null)

        if (newEvents.length > 0 || changed || cursor.toString() !== stored.current.cursor) {
          const merged = [
            ...newEvents,
            ...stored.current.events.map((e) => ({
              ...e,
              blockNumber: BigInt(e.blockNumber),
              amount: BigInt(e.amount),
            })),
          ]
            .sort(byNewest)
            .slice(0, appConfig.feedLimit)
          stored.current = {
            cursor: cursor.toString(),
            payeeCandidates: [...newCandidates],
            events: merged.map((e) => ({
              ...e,
              blockNumber: e.blockNumber.toString(),
              amount: e.amount.toString(),
            })),
          }
          try {
            localStorage.setItem(storageKey, JSON.stringify(stored.current))
          } catch {
            // storage full or unavailable: keep working without a cache
          }
          setEvents(merged)
          setCandidates([...newCandidates])
        }
      } catch (err) {
        if (!stopped) setError(err instanceof Error ? err.message : 'Could not read events.')
      } finally {
        running = false
      }
    }

    void tick()
    const timer = setInterval(() => void tick(), appConfig.pollIntervalMs)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [])

  return { events, candidates, progress, error }
}

/** Current payee list: candidates from PayeeUpdated events, filtered by the live isPayee flag. */
export function usePayees(candidates: Address[]) {
  return useQuery({
    queryKey: ['payees', appConfig.vaultAddress, candidates],
    queryFn: async () => {
      const flags = await Promise.all(
        candidates.map((payee) =>
          publicClient.readContract({
            address: appConfig.vaultAddress,
            abi: vaultAbi,
            functionName: 'isPayee',
            args: [payee],
          }),
        ),
      )
      return candidates.filter((_, i) => flags[i])
    },
    refetchInterval: appConfig.pollIntervalMs,
  })
}
