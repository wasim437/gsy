// All dates are ISO 'YYYY-MM-DD' strings handled in UTC, so Dubai/India/Malaysia users see the same day boundaries.

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function todayISO(): string {
  // Asia/Dubai calendar day
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' })
  return fmt.format(new Date())
}

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return toISO(d)
}

export function addMonths(iso: string, n: number): string {
  const d = parseISO(iso)
  const day = d.getUTCDate()
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(day, lastDay))
  return toISO(target)
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

export function startOfMonth(iso: string): string {
  return iso.slice(0, 7) + '-01'
}

export function endOfMonth(iso: string): string {
  const d = parseISO(startOfMonth(iso))
  return toISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)))
}

export function addMonthKey(key: string, n: number): string {
  return monthKey(addMonths(key + '-01', n))
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86_400_000)
}

/** Whole months from a to b (a contract started on a has completed this many monthly periods by b). */
export function monthsBetween(a: string, b: string): number {
  const da = parseISO(a)
  const db = parseISO(b)
  let m = (db.getUTCFullYear() - da.getUTCFullYear()) * 12 + (db.getUTCMonth() - da.getUTCMonth())
  if (db.getUTCDate() < da.getUTCDate()) m -= 1
  return m
}

export function monthLabel(key: string, style: 'short' | 'long' = 'short'): string {
  const d = parseISO(key + '-01')
  return d.toLocaleDateString('en-GB', { month: style, year: style === 'short' ? '2-digit' : 'numeric', timeZone: 'UTC' })
}

export function fmtDate(iso: string | null | undefined, withYear = true): string {
  if (!iso) return '—'
  const d = parseISO(iso)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' })
}

/** Days until the next occurrence of a birthday (0 = today). */
export function daysToBirthday(dob: string, today: string): number {
  const t = parseISO(today)
  const b = parseISO(dob)
  let next = new Date(Date.UTC(t.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()))
  if (next.getTime() < t.getTime()) next = new Date(Date.UTC(t.getUTCFullYear() + 1, b.getUTCMonth(), b.getUTCDate()))
  return Math.round((next.getTime() - t.getTime()) / 86_400_000)
}
