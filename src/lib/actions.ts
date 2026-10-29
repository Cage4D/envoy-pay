import { erc20Abi, type Address, type Hash, type WalletClient } from 'viem'
import { vaultAbi } from '../abi'
import { appConfig } from '../config'
import { publicClient } from './client'

/**
 * One function per owner action. Each simulates first (so a revert is decoded into a
 * readable error before the wallet is asked to sign) and then sends the transaction
 * through the connected browser wallet. Nothing here ever handles a private key.
 */
export type Wallet = WalletClient

const vault = { address: appConfig.vaultAddress, abi: vaultAbi } as const

export async function approveUsdc(wallet: Wallet, account: Address, amount: bigint): Promise<Hash> {
  const { request } = await publicClient.simulateContract({
    account,
    address: appConfig.usdcAddress,
    abi: erc20Abi,
    functionName: 'approve',
    args: [appConfig.vaultAddress, amount],
  })
  return wallet.writeContract(request)
}

export async function deposit(wallet: Wallet, account: Address, amount: bigint): Promise<Hash> {
  const { request } = await publicClient.simulateContract({ account, ...vault, functionName: 'deposit', args: [amount] })
  return wallet.writeContract(request)
}

export async function withdraw(wallet: Wallet, account: Address, to: Address, amount: bigint): Promise<Hash> {
  const { request } = await publicClient.simulateContract({ account, ...vault, functionName: 'withdraw', args: [to, amount] })
  return wallet.writeContract(request)
}

export async function setAgent(wallet: Wallet, account: Address, agent: Address): Promise<Hash> {
  const { request } = await publicClient.simulateContract({ account, ...vault, functionName: 'setAgent', args: [agent] })
  return wallet.writeContract(request)
}

export async function revokeAgent(wallet: Wallet, account: Address): Promise<Hash> {
  const { request } = await publicClient.simulateContract({ account, ...vault, functionName: 'revokeAgent' })
  return wallet.writeContract(request)
}

export async function setPayee(wallet: Wallet, account: Address, payee: Address, allowed: boolean): Promise<Hash> {
  const { request } = await publicClient.simulateContract({ account, ...vault, functionName: 'setPayee', args: [payee, allowed] })
  return wallet.writeContract(request)
}

export async function setCap(wallet: Wallet, account: Address, cap: bigint): Promise<Hash> {
  const { request } = await publicClient.simulateContract({ account, ...vault, functionName: 'setCap', args: [cap] })
  return wallet.writeContract(request)
}

export async function setWindowDuration(wallet: Wallet, account: Address, seconds: bigint): Promise<Hash> {
  const { request } = await publicClient.simulateContract({ account, ...vault, functionName: 'setWindowDuration', args: [seconds] })
  return wallet.writeContract(request)
}

export async function setPaused(wallet: Wallet, account: Address, paused: boolean): Promise<Hash> {
  const { request } = await publicClient.simulateContract({ account, ...vault, functionName: paused ? 'pause' : 'unpause' })
  return wallet.writeContract(request)
}
