import type { Currency, Money } from '../data/types'

const SYMBOL: Record<Currency, string> = { AED: 'AED', USD: 'USD', INR: 'INR', MYR: 'RM', SGD: 'SGD' }

export function curLabel(c: Currency): string {
  return SYMBOL[c]
}

/** Compact: 12.4M, 310K, 950 */
export function compact(n: number, digits = 1): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (abs >= 1e9) return sign + (abs / 1e9).toFixed(digits) + 'B'
  if (abs >= 1e6) return sign + (abs / 1e6).toFixed(digits) + 'M'
  if (abs >= 1e3) return sign + (abs / 1e3).toFixed(abs >= 1e5 ? 0 : digits) + 'K'
  return sign + abs.toFixed(0)
}

export function full(n: number, decimals = 0): string {
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  return (n < 0 ? '−' : '') + s
}

export function money(n: number, cur: Currency = 'AED', mode: 'compact' | 'full' = 'full'): string {
  return `${SYMBOL[cur]} ${mode === 'compact' ? compact(n) : full(n)}`
}

export function pct(n: number, decimals = 1): string {
  return `${(n * 100).toFixed(decimals)}%`
}

export function moneyEntries(m: Money): [Currency, number][] {
  return (Object.entries(m.byCur) as [Currency, number][]).filter(([, v]) => Math.abs(v) > 0.5).sort((a, b) => b[1] - a[1])
}
