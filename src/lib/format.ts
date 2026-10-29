import { formatUnits, parseUnits } from 'viem'
import { appConfig } from '../config'

/** Raw 6-decimal USDC units -> "1,234.50" (at least 2, at most 6 decimals). */
export function formatUsdc(raw: bigint): string {
  const [whole, frac = ''] = formatUnits(raw, appConfig.usdcDecimals).split('.')
  const trimmed = frac.replace(/0+$/, '').padEnd(2, '0')
  return `${BigInt(whole).toLocaleString('en-US')}.${trimmed}`
}

/** "12.5" -> raw units. Returns null when the text is not a positive amount. */
export function parseUsdc(text: string): bigint | null {
  const value = text.trim()
  if (!/^\d*\.?\d+$|^\d+\.$/.test(value)) return null
  try {
    const raw = parseUnits(value.endsWith('.') ? value.slice(0, -1) : value, appConfig.usdcDecimals)
    return raw > 0n ? raw : null
  } catch {
    return null
  }
}

export const shortAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}
