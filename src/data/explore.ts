// A small "semantic model": measures × dimensions × time, used by the Report Builder and the AI assistant.
// In production, Gemini 2.5 Flash (Vertex AI) returns a VizSpec through function calling; this file turns it into numbers.

import { addMonthKey, endOfMonth, monthKey } from '../lib/dates'
import { ENTITY_COLOR, SERIES } from '../components/charts'
import { contractAED, filteredExpenses, filteredInternal, filteredLeads, isActive, payoutsPaidFiltered, segmentOf, type Ctx } from './engine'

export type MeasureId =
  | 'investment' | 'activeCapital' | 'contracts' | 'payouts' | 'profitDue' | 'capitalDue' | 'overdue'
  | 'companyComm' | 'crmComm' | 'expenses' | 'internal' | 'pipeline'
export type DimId = 'none' | 'country' | 'company' | 'product' | 'currency' | 'sales' | 'segment' | 'category'
export type Grain = 'month' | 'quarter' | 'year'
export type RangeId = 'L6M' | 'L12M' | 'L24M' | 'YTD' | 'N6M' | 'N12M' | 'ALL'
export type ChartKind = 'column' | 'stacked' | 'line' | 'area' | 'bar' | 'donut' | 'treemap' | 'table' | 'kpi'

export interface VizSpec {
  measure: MeasureId
  dim: DimId
  chart: ChartKind
  grain: Grain
  range: RangeId
  topN: number
  cumulative: boolean
  pctOfTotal: boolean
  title?: string
  /** Optional country override (e.g. the AI was asked about India). */
  countries?: string[]
}

export const MEASURES: { id: MeasureId; label: string; unit: 'AED' | 'count'; dims: DimId[]; category?: string; snapshot?: boolean }[] = [
  { id: 'investment', label: 'New investment raised', unit: 'AED', dims: ['country', 'company', 'product', 'currency', 'sales', 'segment'] },
  { id: 'activeCapital', label: 'Active capital (month end)', unit: 'AED', dims: ['country', 'company', 'product', 'currency', 'sales', 'segment'], snapshot: true },
  { id: 'contracts', label: 'New contracts (count)', unit: 'count', dims: ['country', 'company', 'product', 'currency', 'sales', 'segment'] },
  { id: 'payouts', label: 'Payouts made', unit: 'AED', dims: ['country', 'company', 'product', 'currency', 'sales', 'segment'] },
  { id: 'profitDue', label: 'Profit due (schedule)', unit: 'AED', dims: ['country', 'company', 'product', 'currency', 'segment'] },
  { id: 'capitalDue', label: 'Capital to return', unit: 'AED', dims: ['country', 'company', 'product', 'currency', 'segment'] },
  { id: 'overdue', label: 'Overdue unpaid', unit: 'AED', dims: ['country', 'company', 'product', 'currency', 'segment'] },
  { id: 'companyComm', label: 'Company commission', unit: 'AED', dims: ['country', 'company', 'product', 'currency'] },
  { id: 'crmComm', label: 'CRM / freelancer commission', unit: 'AED', dims: ['country', 'company', 'product', 'sales', 'category'], category: 'Staff / freelancer' },
  { id: 'expenses', label: 'Expenses', unit: 'AED', dims: ['country', 'company', 'currency', 'category'], category: 'Expense type' },
  { id: 'internal', label: 'Internal investment', unit: 'AED', dims: ['country', 'company', 'currency', 'category'], category: 'Sub-company' },
  { id: 'pipeline', label: 'New pipeline (expected)', unit: 'AED', dims: ['country', 'product', 'currency', 'sales', 'category'], category: 'Stage' },
]

export const DIM_LABEL: Record<DimId, string> = { none: 'No split', country: 'Country', company: 'Company', product: 'Product', currency: 'Currency', sales: 'Salesperson', segment: 'Investor segment', category: 'Category' }
export const RANGES: { id: RangeId; label: string }[] = [
  { id: 'L6M', label: 'Last 6 months' }, { id: 'L12M', label: 'Last 12 months' }, { id: 'L24M', label: 'Last 24 months' },
  { id: 'YTD', label: 'Year to date' }, { id: 'N6M', label: 'Next 6 months' }, { id: 'N12M', label: 'Next 12 months' }, { id: 'ALL', label: 'All time' },
]
export const CHARTS: { id: ChartKind; label: string }[] = [
  { id: 'column', label: 'Column' }, { id: 'stacked', label: 'Stacked' }, { id: 'line', label: 'Line' }, { id: 'area', label: 'Area' },
  { id: 'bar', label: 'Ranking' }, { id: 'donut', label: 'Donut' }, { id: 'treemap', label: 'Treemap' }, { id: 'table', label: 'Table' }, { id: 'kpi', label: 'KPI' },
]

export const DEFAULT_SPEC: VizSpec = { measure: 'investment', dim: 'country', chart: 'stacked', grain: 'month', range: 'L12M', topN: 5, cumulative: false, pctOfTotal: false }

interface Fact { date: string; v: number; d: Partial<Record<DimId, [string, string]>> }

function rangeMonths(ctx: Ctx, r: RangeId): string[] {
  const m = monthKey(ctx.ref)
  const span: Record<RangeId, [number, number]> = {
    L6M: [-5, 0], L12M: [-11, 0], L24M: [-23, 0], YTD: [-(+m.slice(5, 7) - 1), 0], N6M: [1, 6], N12M: [1, 12], ALL: [-36, 12],
  }
  const [a, b] = span[r]
  return Array.from({ length: b - a + 1 }, (_, i) => addMonthKey(m, a + i))
}

const bucketOf = (month: string, g: Grain) => (g === 'month' ? month : g === 'year' ? month.slice(0, 4) : `${month.slice(0, 4)} Q${Math.ceil(+month.slice(5, 7) / 3)}`)
export const bucketLabel = (b: string, g: Grain) => {
  if (g !== 'month') return b
  return new Date(Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, 1)).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })
}

function facts(ctx: Ctx, m: MeasureId): Fact[] {
  const invTotal = new Map<string, number>()
  for (const c of ctx.ds.contracts) if (c.startDate <= ctx.ref) invTotal.set(c.investorId, (invTotal.get(c.investorId) ?? 0) + contractAED(c, ctx))
  const cDims = (contractId: string): Fact['d'] => {
    const c = ctx.contractById.get(contractId)!
    const inv = ctx.investorById.get(c.investorId)!
    const seg = segmentOf(invTotal.get(inv.id) ?? 0)
    return {
      country: [inv.country, ctx.ds.countries.find((x) => x.code === inv.country)!.name],
      company: [c.companyId, ctx.companyById.get(c.companyId)!.name],
      product: [c.productId, ctx.productById.get(c.productId)!.name],
      currency: [c.currency, c.currency],
      sales: [c.salesId, ctx.salesById.get(c.salesId)!.name],
      segment: [seg, seg],
    }
  }
  switch (m) {
    case 'investment':
    case 'contracts':
      return ctx.contracts.filter((c) => c.startDate <= ctx.ref).map((c) => ({ date: c.startDate, v: m === 'contracts' ? 1 : contractAED(c, ctx), d: cDims(c.id) }))
    case 'payouts':
      return payoutsPaidFiltered(ctx).map((p) => ({ date: p.paidDate, v: ctx.toAED(p.amount, p.currency, p.paidDate), d: cDims(p.contractId) }))
    case 'profitDue':
    case 'capitalDue':
      return ctx.schedule.map((r) => ({ date: r.dueDate, v: ctx.toAED(m === 'profitDue' ? r.profitDue : r.capitalDue, r.currency, r.dueDate), d: cDims(r.contractId) })).filter((f) => f.v > 0)
    case 'overdue':
      return ctx.schedule.filter((r) => r.status === 'Overdue' || r.status === 'Partly paid').map((r) => ({ date: r.dueDate, v: ctx.toAED(r.remaining, r.currency, r.dueDate), d: cDims(r.contractId) }))
    case 'companyComm':
    case 'crmComm':
      return ctx.commission.filter((r) => r.type === (m === 'companyComm' ? 'Company' : 'CRM')).map((r) => {
        const d = cDims(r.contractId)
        if (r.salesId) {
          const sp = ctx.salesById.get(r.salesId)!
          d.sales = [sp.id, sp.name]
          d.category = [sp.type, sp.type]
        }
        return { date: r.date, v: ctx.toAED(r.amount, r.currency, r.date), d }
      })
    case 'expenses':
      return filteredExpenses(ctx).filter((e) => e.date <= ctx.ref).map((e) => ({
        date: e.date, v: ctx.toAED(e.amount, e.currency, e.date),
        d: { country: [e.country, ctx.ds.countries.find((x) => x.code === e.country)!.name], company: [e.companyId, ctx.companyById.get(e.companyId)!.name], currency: [e.currency, e.currency], category: [e.category, e.category] },
      }))
    case 'internal':
      return filteredInternal(ctx).map((t) => ({
        date: t.date, v: ctx.toAED(t.amount, t.currency, t.date),
        d: { country: [t.country, ctx.ds.countries.find((x) => x.code === t.country)!.name], company: [t.fromCompanyId, ctx.companyById.get(t.fromCompanyId)!.name], currency: [t.currency, t.currency], category: [t.toCompanyId, ctx.companyById.get(t.toCompanyId)!.name] },
      }))
    case 'pipeline':
      return filteredLeads(ctx).filter((l) => l.expectedAmount).map((l) => {
        const sp = ctx.salesById.get(l.salesId)!
        return {
          date: l.createdDate, v: ctx.toAED(l.expectedAmount!, l.currency, ctx.ref),
          d: { country: [sp.country, ctx.ds.countries.find((x) => x.code === sp.country)!.name], product: [l.productId, ctx.productById.get(l.productId)!.name], currency: [l.currency, l.currency], sales: [sp.id, sp.name], category: [l.stage, l.stage] },
        }
      })
    case 'activeCapital':
      return []
  }
}

export interface Pivot {
  buckets: string[]
  series: { key: string; label: string; color: string }[]
  rows: Record<string, number | string>[]
  totals: { key: string; label: string; value: number; color: string }[]
  grand: number
  unit: 'AED' | 'count'
  measureLabel: string
  dimLabel: string
}

export function pivot(ctx: Ctx, spec: VizSpec): Pivot {
  const meta = MEASURES.find((x) => x.id === spec.measure)!
  const dim = meta.dims.includes(spec.dim) ? spec.dim : 'none'
  const months = rangeMonths(ctx, spec.range)
  const buckets = [...new Set(months.map((m) => bucketOf(m, spec.grain)))]
  const first = months[0] + '-01'
  const last = endOfMonth(months[months.length - 1] + '-01')

  // cell[bucket][seriesKey] = value
  const cell = new Map<string, Map<string, number>>()
  const labels = new Map<string, string>()
  const add = (b: string, k: string, label: string, v: number) => {
    labels.set(k, label)
    const row = cell.get(b) ?? new Map<string, number>()
    row.set(k, (row.get(k) ?? 0) + v)
    cell.set(b, row)
  }

  if (meta.snapshot) {
    const invTotal = new Map<string, number>()
    for (const c of ctx.ds.contracts) if (c.startDate <= ctx.ref) invTotal.set(c.investorId, (invTotal.get(c.investorId) ?? 0) + contractAED(c, ctx))
    // Active capital: value at the end of the last month in each bucket.
    const lastOfBucket = new Map<string, string>()
    for (const m of months) lastOfBucket.set(bucketOf(m, spec.grain), m)
    for (const [b, m] of lastOfBucket) {
      const d = endOfMonth(m + '-01')
      for (const c of ctx.contracts) {
        if (!isActive(c, d)) continue
        const inv = ctx.investorById.get(c.investorId)!
        const keyLabel: [string, string] =
          dim === 'none' ? ['total', meta.label]
            : dim === 'country' ? [inv.country, ctx.ds.countries.find((x) => x.code === inv.country)!.name]
            : dim === 'company' ? [c.companyId, ctx.companyById.get(c.companyId)!.name]
            : dim === 'product' ? [c.productId, ctx.productById.get(c.productId)!.name]
            : dim === 'currency' ? [c.currency, c.currency]
            : dim === 'sales' ? [c.salesId, ctx.salesById.get(c.salesId)!.name]
            : ((s) => [s, s] as [string, string])(segmentOf(invTotal.get(inv.id) ?? 0))
        add(b, keyLabel[0], keyLabel[1], contractAED(c, ctx))
      }
    }
  } else {
    for (const f of facts(ctx, spec.measure)) {
      if (f.date < first || f.date > last) continue
      const b = bucketOf(monthKey(f.date), spec.grain)
      const [k, l] = dim === 'none' ? ['total', meta.label] : f.d[dim] ?? ['n/a', 'Not applicable']
      add(b, k, l, f.v)
    }
  }

  // Series = top N by total, the rest folded into "Other".
  const totalsMap = new Map<string, number>()
  for (const row of cell.values()) for (const [k, v] of row) totalsMap.set(k, (totalsMap.get(k) ?? 0) + (meta.snapshot ? 0 : v))
  if (meta.snapshot) {
    const lastB = buckets[buckets.length - 1]
    for (const [k, v] of cell.get(lastB) ?? []) totalsMap.set(k, v)
    for (const row of cell.values()) for (const k of row.keys()) if (!totalsMap.has(k)) totalsMap.set(k, 0)
  }
  const ranked = [...totalsMap.entries()].sort((a, b) => b[1] - a[1])
  const top = ranked.slice(0, Math.max(1, spec.topN)).map(([k]) => k)
  const hasOther = ranked.length > top.length
  const colorFor = (k: string, i: number) => ENTITY_COLOR[k] ?? SERIES[i % SERIES.length]
  const series = top.map((k, i) => ({ key: k, label: labels.get(k) ?? k, color: dim === 'none' ? SERIES[0] : colorFor(k, i) }))
  if (hasOther) series.push({ key: '__other', label: 'Other', color: '#a3a9b5' })

  let running: Record<string, number> = {}
  const rows = buckets.map((b) => {
    const row: Record<string, number | string> = { bucket: b, label: bucketLabel(b, spec.grain) }
    const src = cell.get(b) ?? new Map<string, number>()
    for (const s of series) row[s.key] = 0
    for (const [k, v] of src) {
      const key = top.includes(k) ? k : '__other'
      row[key] = (row[key] as number) + v
    }
    if (spec.cumulative && !meta.snapshot) {
      const next: Record<string, number> = {}
      for (const s of series) next[s.key] = (running[s.key] ?? 0) + (row[s.key] as number)
      running = next
      Object.assign(row, next)
    }
    if (spec.pctOfTotal) {
      const tot = series.reduce((a, s) => a + (row[s.key] as number), 0) || 1
      for (const s of series) row[s.key] = ((row[s.key] as number) / tot) * 100
    }
    for (const s of series) row[s.key] = Math.round((row[s.key] as number) * 100) / 100
    return row
  })

  const totals = series.map((s) => ({
    key: s.key, label: s.label, color: s.color,
    value: s.key === '__other' ? ranked.slice(top.length).reduce((a, [, v]) => a + v, 0) : totalsMap.get(s.key) ?? 0,
  }))
  const grand = totals.reduce((a, t) => a + t.value, 0)
  return { buckets, series, rows, totals, grand, unit: meta.unit, measureLabel: meta.label, dimLabel: DIM_LABEL[dim] }
}

export function specTitle(s: VizSpec) {
  const m = MEASURES.find((x) => x.id === s.measure)!
  const r = RANGES.find((x) => x.id === s.range)!.label.toLowerCase()
  return s.title ?? `${m.label}${s.dim !== 'none' ? ` by ${DIM_LABEL[s.dim].toLowerCase()}` : ''} · ${r}`
}

export function toCSV(p: Pivot): string {
  const head = ['Period', ...p.series.map((s) => s.label), 'Total']
  const lines = p.rows.map((r) => [String(r.label), ...p.series.map((s) => String(r[s.key])), String(p.series.reduce((a, s) => a + (r[s.key] as number), 0))])
  return [head, ...lines].map((l) => l.map((x) => `"${x.replace(/"/g, '""')}"`).join(',')).join('\n')
}
