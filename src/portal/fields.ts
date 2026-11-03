// Shared by the record form and the Excel-style sheet: how a value is shown, edited, saved and pasted.

import type { DbRow, RawTables } from '../data/db'
import { fmtDate } from '../lib/dates'
import { refOptions, type Field, type Section } from './sections'

export type Values = Record<string, string | boolean>
export const NUMERIC = ['money', 'number', 'pct']

export function display(f: Field, v: unknown, raw: RawTables): string {
  if (v === null || v === undefined || v === '') return '—'
  switch (f.type) {
    case 'pct': return `${(Number(v) * 100).toFixed(2)}%`
    case 'money': return Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 })
    case 'number': return String(v)
    case 'date': return fmtDate(String(v))
    case 'month': return new Date(String(v).slice(0, 7) + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    case 'bool': return v ? 'Yes' : 'No'
    case 'ref': return refOptions(f.ref!, raw).find(([id]) => id === v)?.[1] ?? '—'
    default: return String(v)
  }
}

/** Database value → what the input holds (percentages as 1.25 for 1.25%). */
export function toForm(f: Field, v: unknown): string | boolean {
  if (f.type === 'bool') return v === null || v === undefined ? Boolean(f.default ?? false) : Boolean(v)
  if (v === null || v === undefined) return ''
  if (f.type === 'pct') return String(Math.round(Number(v) * 1e6) / 1e4)
  if (f.type === 'month') return String(v).slice(0, 7)
  if (f.type === 'date') return String(v).slice(0, 10)
  return String(v)
}

/** Input → database value. */
export function fromForm(f: Field, v: string | boolean): unknown {
  if (f.type === 'bool') return Boolean(v)
  const s = String(v ?? '').trim()
  if (s === '') return null
  switch (f.type) {
    case 'pct': return Number(s.replace('%', '')) / 100
    case 'money': case 'number': return Number(s.replace(/,/g, ''))
    case 'month': return `${s.slice(0, 7)}-01`
    default: return s
  }
}

export function nextCode(codes: string[], prefix: string, digits: number) {
  const nums = codes.filter((c) => c.startsWith(prefix)).map((c) => Number(c.slice(prefix.length))).filter((n) => Number.isFinite(n))
  return prefix + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(digits, '0')
}

export function defaults(s: Section): Values {
  return Object.fromEntries(s.fields.map((f) => [f.key, f.type === 'bool' ? Boolean(f.default ?? false) : String(f.default ?? '')]))
}

/** Problems with one record, by field. Empty when it can be saved. */
export function validate(s: Section, v: Values, raw: RawTables): Record<string, string> {
  const errs: Record<string, string> = {}
  for (const f of s.fields) {
    const x = v[f.key]
    const t = String(x ?? '').trim()
    if (f.required && f.type !== 'bool' && t === '') { errs[f.key] = 'Required'; continue }
    if (t === '' || f.type === 'bool') continue
    if (NUMERIC.includes(f.type) && Number.isNaN(Number(t.replace(/[,%]/g, '')))) errs[f.key] = 'Numbers only'
    else if (f.type === 'pct' && Number(t.replace('%', '')) > 50) errs[f.key] = 'Type the percentage, e.g. 1.75 for 1.75%'
    else if (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(t)) errs[f.key] = 'Use a date, e.g. 25/10/2026'
    else if (f.type === 'month' && !/^\d{4}-\d{2}/.test(t)) errs[f.key] = 'Use a month, e.g. Oct 2026'
    else if (f.type === 'select' && !(f.options ?? []).includes(t)) errs[f.key] = 'Pick from the list'
    else if (f.type === 'ref' && !refOptions(f.ref!, raw).some(([id]) => id === t)) errs[f.key] = 'Pick from the list'
  }
  return errs
}

// ---------------------------------------------------------------- pasting from Excel

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const pad = (n: number) => String(n).padStart(2, '0')

/** Dates as Excel copies them: 2026-10-25, 25/10/2026, 25-Oct-2026, 25 Oct 2026, Oct 25 2026, or a date serial. */
export function parseDate(text: string): string {
  const t = text.trim()
  if (!t) return ''
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    let d = +m[1], mo = +m[2]
    if (mo > 12 && d <= 12) [d, mo] = [mo, d] // 10/25/2026 written month-first
    return `${y}-${pad(mo)}-${pad(d)}`
  }
  m = t.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s,-]+(\d{2,4})$/)
  if (m && MONTHS.includes(m[2].toLowerCase())) return `${m[3].length === 2 ? 2000 + +m[3] : m[3]}-${pad(MONTHS.indexOf(m[2].toLowerCase()) + 1)}-${pad(+m[1])}`
  m = t.match(/^([A-Za-z]{3})[A-Za-z]*\s+(\d{1,2}),?\s+(\d{4})$/)
  if (m && MONTHS.includes(m[1].toLowerCase())) return `${m[3]}-${pad(MONTHS.indexOf(m[1].toLowerCase()) + 1)}-${pad(+m[2])}`
  if (/^\d{5}(\.\d+)?$/.test(t)) return new Date(Date.UTC(1899, 11, 30) + Math.round(+t) * 86_400_000).toISOString().slice(0, 10)
  return t
}

export function parseMonth(text: string): string {
  const t = text.trim()
  const m = t.match(/^([A-Za-z]{3})[A-Za-z]*[\s-]+(\d{2,4})$/)
  if (m && MONTHS.includes(m[1].toLowerCase())) return `${m[2].length === 2 ? 2000 + +m[2] : m[2]}-${pad(MONTHS.indexOf(m[1].toLowerCase()) + 1)}`
  const d = parseDate(t)
  return /^\d{4}-\d{2}/.test(d) ? d.slice(0, 7) : t
}

/** One pasted cell → the value the input expects. */
export function fromPaste(f: Field, text: string, raw: RawTables): string | boolean {
  const t = text.trim()
  switch (f.type) {
    case 'bool': return /^(y|yes|true|1|✓)$/i.test(t)
    case 'date': return parseDate(t)
    case 'month': return parseMonth(t)
    case 'pct': return t.replace(/[%\s]/g, '')
    case 'money': case 'number': return t.replace(/[^\d.-]/g, '')
    case 'select': return (f.options ?? []).find((o) => o.toLowerCase() === t.toLowerCase()) ?? (f.options ?? []).find((o) => t && o.toLowerCase().startsWith(t.toLowerCase())) ?? t
    case 'ref': {
      const opts = refOptions(f.ref!, raw)
      const low = t.toLowerCase()
      const hit = opts.find(([id, l]) => id === t || l.toLowerCase() === low)
        ?? opts.find(([, l]) => l.toLowerCase().split(' · ').some((part) => part === low))
        ?? opts.find(([, l]) => low && l.toLowerCase().includes(low))
      return hit ? hit[0] : t
    }
    default: return t
  }
}

/** Label of a record for messages and the history: its first field, e.g. the investor's name. */
export function rowLabel(s: Section, r: DbRow, raw: RawTables) {
  return display(s.fields[0], r[s.fields[0].key], raw)
}
