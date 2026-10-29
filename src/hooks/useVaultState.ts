import { useQuery } from '@tanstack/react-query'
import { erc20Abi, type Address } from 'viem'
import { vaultAbi } from '../abi'
import { appConfig } from '../config'
import { publicClient } from '../lib/client'

export type VaultState = {
  owner: Address
  agent: Address
  paused: boolean
  cap: bigint
  windowDuration: bigint
  /** Stored spent amount; only meaningful while the window is active (windowEnd > 0). */
  spent: bigint
  remaining: bigint
  /** 0 when no window is active. */
  windowEnd: bigint
  vaultBalance: bigint
  /** Chain time at fetch plus the local clock at fetch, used for a live countdown. */
  chainTime: bigint
  fetchedAtMs: number
  /** Connected wallet's USDC balance and allowance toward the vault (0 when disconnected). */
  walletUsdc: bigint
  allowance: bigint
}

async function readVault(account: Address | undefined): Promise<VaultState> {
  const vault = { address: appConfig.vaultAddress, abi: vaultAbi } as const
  const [owner, agent, paused, cap, windowDuration, spent, remaining, windowEnd, vaultBalance, block] =
    await Promise.all([
      publicClient.readContract({ ...vault, functionName: 'owner' }),
      publicClient.readContract({ ...vault, functionName: 'agent' }),
      publicClient.readContract({ ...vault, functionName: 'paused' }),
      publicClient.readContract({ ...vault, functionName: 'cap' }),
      publicClient.readContract({ ...vault, functionName: 'windowDuration' }),
      publicClient.readContract({ ...vault, functionName: 'spent' }),
      publicClient.readContract({ ...vault, functionName: 'remainingInWindow' }),
      publicClient.readContract({ ...vault, functionName: 'windowEnd' }),
      publicClient.readContract({ ...vault, functionName: 'balance' }),
      publicClient.getBlock(),
    ])

  let walletUsdc = 0n
  let allowance = 0n
  if (account) {
    ;[walletUsdc, allowance] = await Promise.all([
      publicClient.readContract({
        address: appConfig.usdcAddress,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [account],
      }),
      publicClient.readContract({
        address: appConfig.usdcAddress,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [account, appConfig.vaultAddress],
      }),
    ])
  }

  return {
    owner,
    agent,
    paused,
    cap,
    windowDuration,
    spent,
    remaining,
    windowEnd,
    vaultBalance,
    chainTime: block.timestamp,
    fetchedAtMs: Date.now(),
    walletUsdc,
    allowance,
  }
}

export function useVaultState(account: Address | undefined) {
  return useQuery({
    queryKey: ['vault-state', appConfig.chainId, appConfig.vaultAddress, account ?? null],
    queryFn: () => readVault(account),
    refetchInterval: appConfig.pollIntervalMs,
  })
}
