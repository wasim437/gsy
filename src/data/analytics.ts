// Calculations behind the Advanced Analytics pages. Same rules as engine.ts, different cuts.

import { addDays, addMonthKey, endOfMonth, monthKey, monthsBetween } from '../lib/dates'
import { contractAED, expensesForMonth, filteredInternal, isActive, monthlySeries, monthsWindow, type Ctx } from './engine'
import type { Contract } from './types'

/** Active capital (AED) at each month end, split by product. */
export function aumByProduct(ctx: Ctx, months: string[]) {
  return months.map((m) => {
    const d = endOfMonth(m + '-01')
    const row: Record<string, number | string> = { month: m }
    for (const p of ctx.ds.products) row[p.id] = 0
    for (const c of ctx.contracts) if (isActive(c, d)) row[c.productId] = (row[c.productId] as number) + contractAED(c, ctx)
    return row
  })
}

/** Sankey: investor country → investment company → product, sized by active capital. */
export function moneyFlow(ctx: Ctx) {
  const active = ctx.contracts.filter((c) => isActive(c, ctx.ref))
  const countries = ctx.ds.countries.map((c) => ({ id: c.code, name: c.name }))
  const companies = ctx.ds.companies.filter((c) => c.type === 'Investment Co').map((c) => ({ id: c.id, name: c.name }))
  const products = ctx.ds.products.map((p) => ({ id: p.id, name: p.name }))
  const nodes = [...countries, ...companies, ...products]
  const idx = new Map(nodes.map((n, i) => [n.id, i]))
  const agg = new Map<string, number>()
  const add = (a: string, b: string, v: number) => agg.set(`${a}|${b}`, (agg.get(`${a}|${b}`) ?? 0) + v)
  for (const c of active) {
    const v = contractAED(c, ctx)
    const cc = ctx.investorById.get(c.investorId)!.country
    add(cc, c.companyId, v)
    add(c.companyId, c.productId, v)
  }
  const links = [...agg.entries()].filter(([, v]) => v > 0).map(([k, v]) => {
    const [a, b] = k.split('|')
    return { source: idx.get(a)!, target: idx.get(b)!, value: Math.round(v) }
  })
  return { nodes, links }
}

export type Dim = 'country' | 'company' | 'product' | 'sales' | 'currency'
export const DIMS: { id: Dim; label: string }[] = [
  { id: 'country', label: 'Country' },
  { id: 'company', label: 'Company' },
  { id: 'product', label: 'Product' },
  { id: 'sales', label: 'Salesperson' },
  { id: 'currency', label: 'Currency' },
]

export function dimKey(c: Contract, d: Dim, ctx: Ctx): [string, string] {
  switch (d) {
    case 'country': { const k = ctx.investorById.get(c.investorId)!.country; return [k, ctx.ds.countries.find((x) => x.code === k)!.name] }
    case 'company': return [c.companyId, ctx.companyById.get(c.companyId)!.name]
    case 'product': return [c.productId, ctx.productById.get(c.productId)!.name]
    case 'sales': return [c.salesId, ctx.salesById.get(c.salesId)!.name]
    case 'currency': return [c.currency, c.currency]
  }
}

export function breakdown(ctx: Ctx, rows: Contract[], d: Dim) {
  const m = new Map<string, { key: string; label: string; value: number; n: number }>()
  for (const c of rows) {
    const [key, label] = dimKey(c, d, ctx)
    const e = m.get(key) ?? { key, label, value: 0, n: 0 }
    e.value += contractAED(c, ctx)
    e.n++
    m.set(key, e)
  }
  return [...m.values()].sort((a, b) => b.value - a.value)
}

/** Scheduled payouts per calendar day (AED). */
export function dailyDue(ctx: Ctx, from: string, to: string) {
  const m = new Map<string, { due: number; remaining: number; n: number }>()
  for (const r of ctx.schedule) {
    if (r.dueDate < from || r.dueDate > to) continue
    const e = m.get(r.dueDate) ?? { due: 0, remaining: 0, n: 0 }
    e.due += ctx.toAED(r.totalDue, r.currency, r.dueDate)
    e.remaining += ctx.toAED(r.remaining, r.currency, r.dueDate)
    e.n++
    m.set(r.dueDate, e)
  }
  return m
}

export interface StressParams {
  nonRenewPct: number // % of maturing capital investors take back in cash
  salesDropPct: number // % fall in new investment vs the 6-month average
  fxPct: number // % move of INR/MYR/SGD against AED (+ = obligations cost more)
  subReturnPct: number // monthly cash return from sub-companies, % of net internal investment
}

export const BASE_STRESS: StressParams = { nonRenewPct: 35, salesDropPct: 0, fxPct: 0, subReturnPct: 1.8 }

/** 12-month cash runway: opening bank balance, then monthly inflows minus scheduled outflows. */
export function cashRunway(ctx: Ctx, p: StressParams) {
  const hist = monthlySeries(ctx, monthsWindow(ctx, 6).slice(0, 6))
  const avgNew = hist.reduce((s, m) => s + m.investment, 0) / hist.length
  const avgExp = hist.reduce((s, m) => s + m.expenses, 0) / hist.length
  const months = Array.from({ length: 12 }, (_, i) => addMonthKey(monthKey(ctx.ref), i + 1))
  const fwd = monthlySeries(ctx, months)
  const internal = filteredInternal(ctx).reduce((s, t) => s + ctx.toAED(t.amount, t.currency, t.date), 0)
  const horizon = addDays(ctx.ref, 366)
  let pegged = 0
  let floating = 0
  for (const r of ctx.schedule) {
    if (r.dueDate <= ctx.ref || r.dueDate > horizon) continue
    const v = ctx.toAED(r.totalDue, r.currency, r.dueDate)
    if (r.currency === 'AED' || r.currency === 'USD') pegged += v
    else floating += v
  }
  const fxFactor = 1 + (p.fxPct / 100) * (floating / Math.max(1, pegged + floating))
  let bal = ctx.ds.bankBalances.reduce((s, b) => s + ctx.toAED(b.balance, b.currency, b.asOf), 0)
  const opening = bal
  const rows = fwd.map((m) => {
    const inflow = avgNew * (1 - p.salesDropPct / 100) + internal * (p.subReturnPct / 100)
    const capitalOut = m.capitalDue * (p.nonRenewPct / 100)
    const outflow = (m.profitDue + capitalOut) * fxFactor + m.crmComm + avgExp
    bal += inflow - outflow
    return { month: m.month, inflow, outflow, profit: m.profitDue * fxFactor, capital: capitalOut * fxFactor, other: m.crmComm + avgExp, balance: bal }
  })
  const firstNegative = rows.find((r) => r.balance < 0)?.month ?? null
  const low = rows.reduce((a, r) => (r.balance < a.balance ? r : a), rows[0])
  return { opening, rows, firstNegative, low, avgNew, avgExp }
}

/** Investment vintage: capital raised by start month × product. */
export function vintage(ctx: Ctx, months: string[]) {
  return months.map((m) => ({
    month: m,
    cells: ctx.ds.products.map((p) => ctx.contracts.filter((c) => monthKey(c.startDate) === m && c.productId === p.id && c.startDate <= ctx.ref).reduce((s, c) => s + contractAED(c, ctx), 0)),
  }))
}

/** Payout punctuality: % of scheduled payouts paid within 2 days, by month × company. */
export function punctuality(ctx: Ctx, months: string[]) {
  const cos = ctx.ds.companies.filter((c) => c.type === 'Investment Co')
  return months.map((m) => ({
    month: m,
    cells: cos.map((co) => {
      const rows = ctx.schedule.filter((r) => monthKey(r.dueDate) === m && r.dueDate <= ctx.ref && ctx.contractById.get(r.contractId)!.companyId === co.id)
      if (!rows.length) return null
      const onTime = rows.filter((r) => r.paid >= r.totalDue - 0.5 && r.lastPaidDate && r.lastPaidDate <= addDays(r.dueDate, 2)).length
      return onTime / rows.length
    }),
  }))
}

/** One bubble per investor: months to next maturity, active capital, monthly profit. */
export function investorBubbles(ctx: Ctx) {
  const m = new Map<string, { id: string; name: string; country: string; capital: number; profit: number; months: number }>()
  for (const c of ctx.contracts) {
    if (!isActive(c, ctx.ref)) continue
    const inv = ctx.investorById.get(c.investorId)!
    const e = m.get(inv.id) ?? { id: inv.id, name: inv.fullName, country: inv.country, capital: 0, profit: 0, months: 99 }
    e.capital += contractAED(c, ctx)
    e.profit += contractAED(c, ctx) * c.monthlyProfitPct
    e.months = Math.min(e.months, Math.max(0, monthsBetween(ctx.ref, c.endDate)))
    m.set(inv.id, e)
  }
  return [...m.values()]
}

export const SIZE_BINS: [string, number, number][] = [
  ['< 100K', 0, 100_000], ['100–250K', 100_000, 250_000], ['250–500K', 250_000, 500_000],
  ['500K–1M', 500_000, 1_000_000], ['1–2M', 1_000_000, 2_000_000], ['2M +', 2_000_000, Infinity],
]

/** Sample monthly sales targets in AED. Replaced by GSY's real targets. */
export const COUNTRY_TARGETS: Record<string, number> = { AE: 2_400_000, IN: 1_100_000, MY: 700_000 }

export function salesByMonth(ctx: Ctx, months: string[]) {
  return ctx.ds.salesPeople.map((sp) => ({
    sp,
    cells: months.map((m) => ctx.contracts.filter((c) => c.salesId === sp.id && monthKey(c.startDate) === m && c.startDate <= ctx.ref).reduce((s, c) => s + contractAED(c, ctx), 0)),
  }))
}

export const expensesAvg = (ctx: Ctx) => expensesForMonth(ctx, monthKey(ctx.ref)).total
