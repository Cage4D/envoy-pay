import { useCallback, useState } from 'react'
import { useAccount, useConfig, useSwitchChain } from 'wagmi'
import { getWalletClient } from 'wagmi/actions'
import type { Address, Hash } from 'viem'
import { appConfig } from '../config'
import { describeError } from '../lib/errors'
import { publicClient } from '../lib/client'
import type { Wallet } from '../lib/actions'

export type TxStatus =
  | { phase: 'idle' }
  | { phase: 'wallet'; label: string }
  | { phase: 'confirming'; label: string; hash: Hash }
  | { phase: 'success'; label: string; hash: Hash }
  | { phase: 'error'; message: string }

export type TxStep = { label: string; send: (wallet: Wallet, account: Address) => Promise<Hash> }

/** Runs one or more transactions in order, reporting only states it can actually verify. */
export function useTx(onDone: () => void) {
  const { address, chainId } = useAccount()
  const wagmiConfig = useConfig()
  const { switchChainAsync } = useSwitchChain()
  const [status, setStatus] = useState<TxStatus>({ phase: 'idle' })
  const busy = status.phase === 'wallet' || status.phase === 'confirming'

  const run = useCallback(
    async (steps: TxStep[]) => {
      if (!address) {
        setStatus({ phase: 'error', message: 'Connect your wallet to continue.' })
        return
      }
      try {
        if (chainId !== appConfig.chainId) {
          setStatus({ phase: 'wallet', label: `Switch to ${appConfig.chainName}` })
          await switchChainAsync({ chainId: appConfig.chainId })
        }
        const wallet = await getWalletClient(wagmiConfig, { chainId: appConfig.chainId })
        let last: Hash | undefined
        let lastLabel = ''
        for (const step of steps) {
          setStatus({ phase: 'wallet', label: step.label })
          const hash = await step.send(wallet, address)
          setStatus({ phase: 'confirming', label: step.label, hash })
          const receipt = await publicClient.waitForTransactionReceipt({ hash })
          if (receipt.status !== 'success') {
            setStatus({ phase: 'error', message: `${step.label} was mined but reverted onchain.` })
            return
          }
          last = hash
          lastLabel = step.label
        }
        if (last) setStatus({ phase: 'success', label: lastLabel, hash: last })
        onDone()
      } catch (err) {
        const message = describeError(err)
        setStatus(message === null ? { phase: 'idle' } : { phase: 'error', message })
      }
    },
    [address, chainId, onDone, switchChainAsync, wagmiConfig],
  )

  return { status, busy, run, dismiss: () => setStatus({ phase: 'idle' }) }
}
