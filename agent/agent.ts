/**
 * Local demo for the EnvoyVault agent. Runs on your machine only, never deployed.
 *
 *   a) tryPay to an allowlisted payee            -> PaymentExecuted
 *   b) tryPay to a payee that is NOT allowlisted -> PaymentRejected (reason 1)
 *   c) tryPay for more than the cap              -> PaymentRejected (reason 3)
 *
 * Config comes from agent/.env (gitignored). See agent/.env.example.
 */
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  defineChain,
  formatUnits,
  http,
  isAddress,
  parseEventLogs,
  parseUnits,
  type Address,
  type Hash,
  type Hex,
} from 'viem'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { privateKeyToAccount } from 'viem/accounts'
import { REJECT_REASONS, vaultAbi } from '../src/abi'

// Load agent/.env from next to this file, so it works from any working directory.
const envPath = fileURLToPath(new URL('./.env', import.meta.url))
if (existsSync(envPath)) process.loadEnvFile(envPath)

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) fail(`Missing ${name}. Copy agent/.env.example to agent/.env and fill it in.`)
  return value
}

function fail(message: string): never {
  console.error(`\nError: ${message}`)
  process.exit(1)
}

function requiredAddress(name: string, fallback?: string): Address {
  const value = process.env[name]?.trim() || fallback
  if (!value) fail(`Missing ${name}. Copy agent/.env.example to agent/.env and fill it in.`)
  if (!isAddress(value)) fail(`${name} is not a valid address.`)
  return value
}

const privateKey = required('AGENT_PRIVATE_KEY')
if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) fail('AGENT_PRIVATE_KEY must be a 0x-prefixed 32-byte hex key.')

const rpcUrl = required('RPC_URL')
const chainId = Number(required('CHAIN_ID'))
const explorerBase = required('EXPLORER_BASE_URL').replace(/\/+$/, '')
const vault = requiredAddress('VAULT_ADDRESS')
const allowedPayee = requiredAddress('ALLOWED_PAYEE')
// Well-known burn address: used only as a payee the vault should NOT accept. It never receives funds.
const blockedPayee = requiredAddress('NOT_ALLOWED_PAYEE', '0x000000000000000000000000000000000000dEaD')
const usdcDecimals = Number(process.env.USDC_DECIMALS ?? '6')
const payAmount = parseUnits(process.env.PAY_AMOUNT_USDC?.trim() || '0.01', usdcDecimals)

const chain = defineChain({
  id: chainId,
  name: process.env.CHAIN_NAME?.trim() || `Chain ${chainId}`,
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
})
const account = privateKeyToAccount(privateKey as Hex)
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) })
const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) })

const usdc = (raw: bigint) => `${formatUnits(raw, usdcDecimals)} USDC`
const read = { address: vault, abi: vaultAbi } as const

function explainError(err: unknown): string {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError)
    if (revert instanceof ContractFunctionRevertedError && revert.data) {
      return `${revert.data.errorName}(${(revert.data.args ?? []).map(String).join(', ')})`
    }
    return err.shortMessage
  }
  return err instanceof Error ? err.message : String(err)
}

type Outcome = { step: string; hash?: Hash; result: string }

async function attempt(step: string, payee: Address, amount: bigint): Promise<Outcome> {
  console.log(`\n${step}`)
  console.log(`  payee ${payee}, amount ${usdc(amount)}`)
  try {
    const { request, result } = await publicClient.simulateContract({
      account,
      ...read,
      functionName: 'tryPay',
      args: [payee, amount],
    })
    console.log(`  simulation: tryPay would return ${result}`)
    const hash = await walletClient.writeContract(request)
    console.log(`  tx hash:  ${hash}`)
    console.log(`  explorer: ${explorerBase}/tx/${hash}`)
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') return { step, hash, result: 'transaction reverted' }

    const events = parseEventLogs({
      abi: vaultAbi,
      logs: receipt.logs,
      eventName: ['PaymentExecuted', 'PaymentRejected'],
    })
    let summary = 'no payment event found'
    for (const event of events) {
      if (event.eventName === 'PaymentExecuted') {
        summary = `PaymentExecuted: paid ${usdc(event.args.amount)}, spent in window ${usdc(event.args.spentInWindow)}`
      } else {
        const reason = REJECT_REASONS[event.args.reason] ?? 'Unknown'
        summary = `PaymentRejected: reason ${event.args.reason} (${reason})`
      }
      console.log(`  event:    ${summary}`)
    }
    return { step, hash, result: summary }
  } catch (err) {
    const message = explainError(err)
    console.log(`  failed:   ${message}`)
    return { step, result: `failed: ${message}` }
  }
}

async function main() {
  console.log(`Agent ${account.address}`)
  console.log(`Vault ${vault} on ${chain.name} (${chainId})`)

  const rpcChainId = await publicClient.getChainId()
  if (rpcChainId !== chainId) fail(`RPC_URL is chain ${rpcChainId} but CHAIN_ID is ${chainId}.`)

  const [registeredAgent, paused, cap, remaining, balance, allowedOk, blockedOk, gas] = await Promise.all([
    publicClient.readContract({ ...read, functionName: 'agent' }),
    publicClient.readContract({ ...read, functionName: 'paused' }),
    publicClient.readContract({ ...read, functionName: 'cap' }),
    publicClient.readContract({ ...read, functionName: 'remainingInWindow' }),
    publicClient.readContract({ ...read, functionName: 'balance' }),
    publicClient.readContract({ ...read, functionName: 'isPayee', args: [allowedPayee] }),
    publicClient.readContract({ ...read, functionName: 'isPayee', args: [blockedPayee] }),
    publicClient.getBalance({ address: account.address }),
  ])

  console.log(`\nVault balance ${usdc(balance)}, cap ${usdc(cap)}, remaining this window ${usdc(remaining)}${paused ? ', PAUSED' : ''}`)

  if (registeredAgent.toLowerCase() !== account.address.toLowerCase()) {
    fail(`This key is not the registered agent (vault agent is ${registeredAgent}). Ask the owner to set ${account.address} as agent.`)
  }
  if (!allowedOk) fail(`ALLOWED_PAYEE ${allowedPayee} is not allowlisted. Ask the owner to add it as a payee.`)
  if (blockedOk) fail(`NOT_ALLOWED_PAYEE ${blockedPayee} is allowlisted, so step b would pay it. Pick another address.`)
  if (payAmount > remaining) {
    fail(`PAY_AMOUNT_USDC (${usdc(payAmount)}) is greater than remainingInWindow() (${usdc(remaining)}). Lower PAY_AMOUNT_USDC or wait for the window to reset. No transaction was sent.`)
  }
  if (payAmount > balance) {
    fail(`PAY_AMOUNT_USDC (${usdc(payAmount)}) is greater than the vault balance (${usdc(balance)}). Lower PAY_AMOUNT_USDC or ask the owner to deposit. No transaction was sent.`)
  }
  if (gas === 0n) fail(`The agent wallet ${account.address} has no USDC for gas. Fund it first.`)

  const outcomes = [
    await attempt('a) tryPay to an allowlisted payee', allowedPayee, payAmount),
    await attempt('b) tryPay to a payee that is not allowlisted', blockedPayee, payAmount),
    await attempt('c) tryPay for more than the cap', allowedPayee, cap + 1n),
  ]

  console.log('\nSummary')
  for (const outcome of outcomes) console.log(`  ${outcome.step}: ${outcome.result}`)
}

main().catch((err) => fail(explainError(err)))
