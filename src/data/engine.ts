// The calculation engine. Every number on screen comes from here, so Accounts can verify one set of rules.
// Business rules follow docs/REQUIREMENTS.md §4 (brief §7).

import { addDays, addMonthKey, daysBetween, daysToBirthday, endOfMonth, monthKey, monthsBetween } from '../lib/dates'
import { buildCommissionSchedule, buildPayoutSchedule } from './schedule'
import type {
  CommissionScheduleRow, Company, Contract, Currency, Dataset, Investor, Lead, Money, PayoutScheduleRow, Product, SalesPerson,
} from './types'
import { OPEN_STAGES } from './types'

export type Segment = 'Platinum' | 'Gold' | 'Silver'
export type ContractState = 'Active' | 'Matured' | 'Upcoming'

/** Slicers. An empty list means "all". */
export interface Filters {
  companyIds: string[]
  countries: string[]
  productIds: string[]
  currencies: Currency[]
  salesIds: string[]
  segments: Segment[]
  states: ContractState[]
  view: 'AED' | 'ORIGINAL'
  month: string // YYYY-MM
}

export type ListFilterKey = 'companyIds' | 'countries' | 'productIds' | 'currencies' | 'salesIds' | 'segments' | 'states'

export const pass = <T,>(list: T[], v: T | undefined) => list.length === 0 || (v !== undefined && list.includes(v))

export type RowStatus = 'Paid' | 'Partly paid' | 'Overdue' | 'Due' | 'Upcoming'

export interface ScheduleRowX extends PayoutScheduleRow {
  remaining: number
  status: RowStatus
  daysLate: number
}

export class MoneyAcc implements Money {
  aed = 0
  byCur: Partial<Record<Currency, number>> = {}
  add(amount: number, cur: Currency, aedAmount: number) {
    this.aed += aedAmount
    this.byCur[cur] = (this.byCur[cur] ?? 0) + amount
    return this
  }
}

export interface Ctx {
  ds: Dataset
  filters: Filters
  today: string
  /** Reference date: today for the current month, otherwise the last day of the selected month. */
  ref: string
  monthStart: string
  monthEnd: string
  isCurrentMonth: boolean
  contracts: Contract[]
  contractIds: Set<string>
  schedule: ScheduleRowX[]
  commission: CommissionScheduleRow[]
  investorById: Map<string, Investor>
  productById: Map<string, Product>
  companyById: Map<string, Company>
  salesById: Map<string, SalesPerson>
  contractById: Map<string, Contract>
  fx: (cur: Currency, iso: string) => number
  toAED: (amount: number, cur: Currency, iso: string) => number
}

export function makeFx(ds: Dataset) {
  const map = new Map(ds.fxRates.map((f) => [`${f.currency}|${f.month}`, f.rateToAED]))
  const months = [...new Set(ds.fxRates.map((f) => f.month))].sort()
  return (cur: Currency, iso: string): number => {
    if (cur === 'AED') return 1
    const k = monthKey(iso)
    const hit = map.get(`${cur}|${k}`)
    if (hit !== undefined) return hit
    // Fallback: nearest month available (latest before, else earliest).
    const before = months.filter((m) => m <= k).pop() ?? months[0]
    return map.get(`${cur}|${before}`) ?? 1
  }
}

export function buildCtx(ds: Dataset, filters: Filters, today: string): Ctx {
  const isCurrentMonth = filters.month === monthKey(today)
  const ref = isCurrentMonth ? today : filters.month < monthKey(today) ? endOfMonth(filters.month + '-01') : filters.month + '-01'
  const fx = makeFx(ds)
  const toAED = (a: number, c: Currency, iso: string) => a * fx(c, iso)
  const investorById = new Map(ds.investors.map((i) => [i.id, i]))
  const productById = new Map(ds.products.map((p) => [p.id, p]))
  const companyById = new Map(ds.companies.map((c) => [c.id, c]))
  const salesById = new Map(ds.salesPeople.map((s) => [s.id, s]))
  const contractById = new Map(ds.contracts.map((c) => [c.id, c]))

  // Investor segment is based on everything they have invested (not affected by other filters).
  const invTotal = new Map<string, number>()
  for (const c of ds.contracts) if (c.startDate <= ref) invTotal.set(c.investorId, (invTotal.get(c.investorId) ?? 0) + toAED(c.amount, c.currency, c.startDate))
  const stateOf = (c: Contract): ContractState => (c.startDate > ref ? 'Upcoming' : c.endDate < ref ? 'Matured' : 'Active')

  const contracts = ds.contracts.filter(
    (c) =>
      pass(filters.companyIds, c.companyId) &&
      pass(filters.productIds, c.productId) &&
      pass(filters.countries, investorById.get(c.investorId)?.country) &&
      pass(filters.currencies, c.currency) &&
      pass(filters.salesIds, c.salesId) &&
      pass(filters.segments, segmentOf(invTotal.get(c.investorId) ?? 0)) &&
      pass(filters.states, stateOf(c)),
  )
  const contractIds = new Set(contracts.map((c) => c.id))

  // Payout schedule + FIFO allocation of payments made up to the reference date.
  const paidByContract = new Map<string, { amount: number; date: string }[]>()
  for (const p of ds.payoutsPaid) {
    if (!contractIds.has(p.contractId) || p.paidDate > ref) continue
    const list = paidByContract.get(p.contractId) ?? []
    list.push({ amount: p.amount, date: p.paidDate })
    paidByContract.set(p.contractId, list)
  }
  const schedule: ScheduleRowX[] = []
  for (const c of contracts) {
    const rows = buildPayoutSchedule(c, productById.get(c.productId)!)
    const pays = (paidByContract.get(c.id) ?? []).sort((a, b) => a.date.localeCompare(b.date))
    let pi = 0
    let carry = pays[0]?.amount ?? 0
    for (const row of rows) {
      let need = row.totalDue
      while (need > 0.005 && pi < pays.length) {
        const take = Math.min(need, carry)
        row.paid += take
        row.lastPaidDate = pays[pi].date
        need -= take
        carry -= take
        if (carry <= 0.005) carry = pays[++pi]?.amount ?? 0
      }
      const remaining = Math.max(0, row.totalDue - row.paid)
      const daysLate = remaining > 0.5 ? Math.max(0, daysBetween(row.dueDate, ref)) : 0
      const status: RowStatus =
        remaining <= 0.5 ? 'Paid' : row.dueDate < ref ? (row.paid > 0 ? 'Partly paid' : 'Overdue') : row.dueDate <= endOfMonth(ref) ? 'Due' : 'Upcoming'
      schedule.push({ ...row, remaining, status, daysLate })
    }
  }

  const commission: CommissionScheduleRow[] = []
  for (const c of contracts) {
    commission.push(...buildCommissionSchedule(c, productById.get(c.productId)!, companyById.get(c.companyId)!, salesById.get(c.salesId)))
  }

  return {
    ds, filters, today, ref, isCurrentMonth,
    monthStart: filters.month + '-01', monthEnd: endOfMonth(filters.month + '-01'),
    contracts, contractIds, schedule, commission,
    investorById, productById, companyById, salesById, contractById, fx, toAED,
  }
}

// ---------------------------------------------------------------- helpers

export const inMonth = (iso: string, ctx: Ctx) => iso >= ctx.monthStart && iso <= ctx.monthEnd
export const isActive = (c: Contract, ref: string) => c.startDate <= ref && c.endDate >= ref
export const contractAED = (c: Contract, ctx: Ctx) => ctx.toAED(c.amount, c.currency, c.startDate)

export function sumMoney<T>(rows: T[], amount: (r: T) => number, cur: (r: T) => Currency, date: (r: T) => string, ctx: Ctx): MoneyAcc {
  const m = new MoneyAcc()
  for (const r of rows) m.add(amount(r), cur(r), ctx.toAED(amount(r), cur(r), date(r)))
  return m
}

const leadCountry = (l: Lead, ctx: Ctx) => ctx.salesById.get(l.salesId)?.country
export function filteredLeads(ctx: Ctx): Lead[] {
  const f = ctx.filters
  return ctx.ds.leads.filter(
    (l) => l.createdDate <= ctx.ref && pass(f.countries, leadCountry(l, ctx)) && pass(f.productIds, l.productId) && pass(f.salesIds, l.salesId) && pass(f.currencies, l.currency),
  )
}

export function filteredExpenses(ctx: Ctx) {
  const f = ctx.filters
  return ctx.ds.expenses.filter((e) => pass(f.companyIds, e.companyId) && pass(f.countries, e.country))
}

export function filteredInternal(ctx: Ctx) {
  const f = ctx.filters
  return ctx.ds.internalInvestments.filter((t) => t.date <= ctx.ref && pass(f.companyIds, t.fromCompanyId) && pass(f.countries, t.country) && pass(f.currencies, t.currency))
}

export function payoutsPaidFiltered(ctx: Ctx) {
  return ctx.ds.payoutsPaid.filter((p) => ctx.contractIds.has(p.contractId) && p.paidDate <= ctx.ref)
}

// ---------------------------------------------------------------- headline KPIs (Home)

export function homeKpis(ctx: Ctx) {
  const funded = ctx.contracts.filter((c) => c.startDate <= ctx.ref)
  const totalInvestment = sumMoney(funded, (c) => c.amount, (c) => c.currency, (c) => c.startDate, ctx)
  const newThisMonth = funded.filter((c) => inMonth(c.startDate, ctx))
  const newMoney = sumMoney(newThisMonth, (c) => c.amount, (c) => c.currency, (c) => c.startDate, ctx)

  const paid = payoutsPaidFiltered(ctx)
  const payoutsToDate = sumMoney(paid, (p) => p.amount, (p) => p.currency, (p) => p.paidDate, ctx)

  const dueRows = ctx.schedule.filter((r) => inMonth(r.dueDate, ctx))
  const dueMonth = sumMoney(dueRows, (r) => r.totalDue, (r) => r.currency, (r) => r.dueDate, ctx)
  const dueMonthPaid = sumMoney(dueRows, (r) => r.paid, (r) => r.currency, (r) => r.dueDate, ctx)
  const dueMonthPending = sumMoney(dueRows, (r) => r.remaining, (r) => r.currency, (r) => r.dueDate, ctx)
  const overdueRows = ctx.schedule.filter((r) => r.status === 'Overdue' || r.status === 'Partly paid')
  const overdue = sumMoney(overdueRows, (r) => r.remaining, (r) => r.currency, (r) => r.dueDate, ctx)

  const active = ctx.contracts.filter((c) => isActive(c, ctx.ref))
  const activeInvestors = new Set(active.map((c) => c.investorId)).size

  const expiring = ctx.contracts.filter((c) => inMonth(c.endDate, ctx))
  const expiringCapital = sumMoney(expiring, (c) => c.amount, (c) => c.currency, (c) => c.endDate, ctx)

  const internal = filteredInternal(ctx)
  const internalTotal = sumMoney(internal, (t) => t.amount, (t) => t.currency, (t) => t.date, ctx)

  const comm = companyCommission(ctx)
  const crm = crmCommission(ctx)
  const exp = expensesForMonth(ctx, monthKey(ctx.ref))
  const surplus = comm.month.aed - exp.total - crm.month.aed

  const birthdays = upcomingBirthdays(ctx, 2)

  return {
    totalInvestment, newThisMonth, newMoney, payoutsToDate,
    dueMonth, dueMonthPaid, dueMonthPending, overdue, overdueRows,
    activeContracts: active.length, activeInvestors, activeCapital: sumMoney(active, (c) => c.amount, (c) => c.currency, (c) => c.startDate, ctx),
    expiring, expiringCapital, internalTotal, comm, crm, exp, surplus, birthdays,
  }
}

// ---------------------------------------------------------------- commissions & expenses

export function companyCommission(ctx: Ctx) {
  const rows = ctx.commission.filter((r) => r.type === 'Company')
  const m = (pred: (r: CommissionScheduleRow) => boolean) =>
    sumMoney(rows.filter(pred), (r) => r.amount, (r) => r.currency, (r) => r.date, ctx)
  return {
    month: m((r) => inMonth(r.date, ctx)),
    toDate: m((r) => r.date <= ctx.ref),
    toEarn: m((r) => r.date > ctx.monthEnd),
    rows,
  }
}

export function expensesForMonth(ctx: Ctx, key: string) {
  const rows = filteredExpenses(ctx).filter((e) => monthKey(e.date) === key && e.date <= ctx.ref)
  const by: Record<string, number> = { Salary: 0, Rent: 0, Marketing: 0, Other: 0 }
  for (const e of rows) by[e.category] += ctx.toAED(e.amount, e.currency, e.date)
  return { total: by.Salary + by.Rent + by.Marketing + by.Other, by, rows }
}

export interface PersonCommission {
  sp: SalesPerson
  deals: number
  raised: Partial<Record<Currency, number>>
  raisedAED: number
  earned: number
  paid: number
  payable: number
  toEarn: number
  potential: number
  pipelineValue: number
}

export function crmCommission(ctx: Ctx) {
  const rows = ctx.commission.filter((r) => r.type === 'CRM')
  const month = sumMoney(rows.filter((r) => inMonth(r.date, ctx)), (r) => r.amount, (r) => r.currency, (r) => r.date, ctx)
  const earnedRows = rows.filter((r) => r.date <= ctx.ref)
  const paidRows = ctx.ds.commissionsPaid.filter((p) => ctx.contractIds.has(p.contractId) && p.paidDate <= ctx.ref)
  const toEarnRows = rows.filter((r) => r.date > ctx.ref)
  const leads = filteredLeads(ctx).filter((l) => OPEN_STAGES.includes(l.stage))

  const people = new Map<string, PersonCommission>()
  const P = (id: string) => {
    let p = people.get(id)
    if (!p) {
      p = { sp: ctx.salesById.get(id)!, deals: 0, raised: {}, raisedAED: 0, earned: 0, paid: 0, payable: 0, toEarn: 0, potential: 0, pipelineValue: 0 }
      people.set(id, p)
    }
    return p
  }
  for (const sp of ctx.ds.salesPeople) if (pass(ctx.filters.countries, sp.country) && pass(ctx.filters.salesIds, sp.id)) P(sp.id)
  for (const c of ctx.contracts) {
    if (c.startDate > ctx.ref) continue
    const p = P(c.salesId)
    p.deals++
    p.raised[c.currency] = (p.raised[c.currency] ?? 0) + c.amount
    p.raisedAED += contractAED(c, ctx)
  }
  for (const r of earnedRows) P(r.salesId!).earned += ctx.toAED(r.amount, r.currency, r.date)
  for (const r of paidRows) P(r.salesId).paid += ctx.toAED(r.amount, r.currency, r.paidDate)
  for (const r of toEarnRows) P(r.salesId!).toEarn += ctx.toAED(r.amount, r.currency, r.date)
  for (const l of leads) {
    if (!l.expectedAmount) continue
    const p = P(l.salesId)
    const v = ctx.toAED(l.expectedAmount, l.currency, ctx.ref)
    p.pipelineValue += v
    p.potential += v * p.sp.commissionPct
  }
  const list = [...people.values()].map((p) => ({ ...p, payable: p.earned - p.paid })).sort((a, b) => b.raisedAED - a.raisedAED)
  const sum = (k: 'earned' | 'paid' | 'payable' | 'toEarn' | 'potential') => list.reduce((s, p) => s + p[k], 0)
  return { month, people: list, earned: sum('earned'), paid: sum('paid'), payable: sum('payable'), toEarn: sum('toEarn'), potential: sum('potential') }
}

// ---------------------------------------------------------------- time series

export function monthsWindow(ctx: Ctx, back = 11, forward = 0): string[] {
  const out: string[] = []
  for (let i = -back; i <= forward; i++) out.push(addMonthKey(ctx.filters.month, i))
  return out
}

export function monthlySeries(ctx: Ctx, months: string[]) {
  const paid = payoutsPaidFiltered(ctx)
  const compRows = ctx.commission.filter((r) => r.type === 'Company')
  const crmRows = ctx.commission.filter((r) => r.type === 'CRM')
  return months.map((k) => {
    const inv = ctx.contracts.filter((c) => monthKey(c.startDate) === k && c.startDate <= ctx.ref).reduce((s, c) => s + contractAED(c, ctx), 0)
    const matured = ctx.contracts.filter((c) => monthKey(c.endDate) === k).reduce((s, c) => s + ctx.toAED(c.amount, c.currency, c.endDate), 0)
    const payouts = paid.filter((p) => monthKey(p.paidDate) === k).reduce((s, p) => s + ctx.toAED(p.amount, p.currency, p.paidDate), 0)
    const due = ctx.schedule.filter((r) => monthKey(r.dueDate) === k)
    const profitDue = due.reduce((s, r) => s + ctx.toAED(r.profitDue, r.currency, r.dueDate), 0)
    const capitalDue = due.reduce((s, r) => s + ctx.toAED(r.capitalDue, r.currency, r.dueDate), 0)
    const companyComm = compRows.filter((r) => monthKey(r.date) === k).reduce((s, r) => s + ctx.toAED(r.amount, r.currency, r.date), 0)
    const crmComm = crmRows.filter((r) => monthKey(r.date) === k).reduce((s, r) => s + ctx.toAED(r.amount, r.currency, r.date), 0)
    const exp = expensesForMonth(ctx, k)
    return { month: k, investment: inv, matured, payouts, profitDue, capitalDue, companyComm, crmComm, expenses: exp.total, expBy: exp.by, surplus: companyComm - exp.total - crmComm }
  })
}

// ---------------------------------------------------------------- investors

export function investorSummary(ctx: Ctx, investorId: string) {
  const cs = ctx.contracts.filter((c) => c.investorId === investorId)
  const rows = ctx.schedule.filter((r) => cs.some((c) => c.id === r.contractId))
  const invested = sumMoney(cs.filter((c) => c.startDate <= ctx.ref), (c) => c.amount, (c) => c.currency, (c) => c.startDate, ctx)
  const profitPaid = sumMoney(rows, (r) => Math.min(r.paid, r.profitDue), (r) => r.currency, (r) => r.dueDate, ctx)
  const profitRemaining = sumMoney(rows.filter((r) => r.dueDate > ctx.ref), (r) => r.profitDue, (r) => r.currency, (r) => r.dueDate, ctx)
  const outstanding = sumMoney(rows.filter((r) => r.dueDate <= ctx.ref), (r) => r.remaining, (r) => r.currency, (r) => r.dueDate, ctx)
  const next = rows.filter((r) => r.dueDate > ctx.ref).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]
  const perContract = cs.map((c) => {
    const done = Math.min(c.tenureMonths, Math.max(0, monthsBetween(c.startDate, ctx.ref)))
    return { c, monthsCompleted: done, monthsPending: c.tenureMonths - done, active: isActive(c, ctx.ref) }
  })
  return { contracts: cs, rows, invested, profitPaid, profitRemaining, outstanding, next, perContract }
}

export function investorTable(ctx: Ctx) {
  const map = new Map<string, { inv: Investor; contracts: number; active: number; aed: number; byCur: Partial<Record<Currency, number>>; profitPaid: number; overdue: number; next: string | null }>()
  for (const c of ctx.contracts) {
    if (c.startDate > ctx.ref) continue
    const inv = ctx.investorById.get(c.investorId)!
    const e = map.get(inv.id) ?? { inv, contracts: 0, active: 0, aed: 0, byCur: {}, profitPaid: 0, overdue: 0, next: null }
    e.contracts++
    if (isActive(c, ctx.ref)) e.active++
    e.aed += contractAED(c, ctx)
    e.byCur[c.currency] = (e.byCur[c.currency] ?? 0) + c.amount
    map.set(inv.id, e)
  }
  for (const r of ctx.schedule) {
    const c = ctx.contractById.get(r.contractId)!
    const e = map.get(c.investorId)
    if (!e) continue
    e.profitPaid += ctx.toAED(Math.min(r.paid, r.profitDue), r.currency, r.dueDate)
    if (r.status === 'Overdue' || r.status === 'Partly paid') e.overdue += ctx.toAED(r.remaining, r.currency, r.dueDate)
    if (r.dueDate > ctx.ref && (!e.next || r.dueDate < e.next)) e.next = r.dueDate
  }
  return [...map.values()].sort((a, b) => b.aed - a.aed)
}

export function segmentOf(aed: number): 'Platinum' | 'Gold' | 'Silver' {
  return aed >= 1_000_000 ? 'Platinum' : aed >= 300_000 ? 'Gold' : 'Silver'
}

// ---------------------------------------------------------------- alerts

export function upcomingBirthdays(ctx: Ctx, withinDays: number) {
  const ids = new Set(ctx.contracts.map((c) => c.investorId))
  return ctx.ds.investors
    .filter((i) => ids.has(i.id) && i.dateOfBirth)
    .map((i) => ({ inv: i, days: daysToBirthday(i.dateOfBirth!, ctx.today) }))
    .filter((x) => x.days <= withinDays)
    .sort((a, b) => a.days - b.days)
}

export function kycAlerts(ctx: Ctx, withinDays = 30) {
  const ids = new Set(ctx.contracts.map((c) => c.investorId))
  const out: { inv: Investor; doc: string; expiry: string; days: number }[] = []
  for (const i of ctx.ds.investors) {
    if (!ids.has(i.id)) continue
    for (const [doc, d] of [['Passport', i.passportExpiry], ['Emirates ID', i.emiratesIdExpiry]] as const) {
      if (!d) continue
      const days = daysBetween(ctx.today, d)
      if (days <= withinDays) out.push({ inv: i, doc, expiry: d, days })
    }
  }
  return out.sort((a, b) => a.days - b.days)
}

export function stuckLeads(ctx: Ctx, days = 7) {
  return filteredLeads(ctx)
    .filter((l) => OPEN_STAGES.includes(l.stage) && daysBetween(l.lastActivityDate, ctx.ref) > days)
    .sort((a, b) => a.lastActivityDate.localeCompare(b.lastActivityDate))
}

export function liquidity(ctx: Ctx) {
  const cash = ctx.ds.bankBalances.reduce((s, b) => s + ctx.toAED(b.balance, b.currency, b.asOf), 0)
  const horizon = addDays(ctx.ref, 90)
  const obligations = ctx.schedule.filter((r) => r.dueDate > ctx.ref && r.dueDate <= horizon).reduce((s, r) => s + ctx.toAED(r.totalDue, r.currency, r.dueDate), 0)
  const overdue = ctx.schedule.reduce((s, r) => s + (r.status === 'Overdue' || r.status === 'Partly paid' ? ctx.toAED(r.remaining, r.currency, r.dueDate) : 0), 0)
  return { cash, obligations: obligations + overdue, ratio: obligations + overdue > 0 ? cash / (obligations + overdue) : 0 }
}

// ---------------------------------------------------------------- data quality / reconciliation

export function dataQuality(ds: Dataset) {
  const contractIds = new Set(ds.contracts.map((c) => c.id))
  return [
    { check: 'Investors without date of birth', table: 'Investors', items: ds.investors.filter((i) => !i.dateOfBirth).map((i) => `${i.id} · ${i.fullName}`) },
    { check: 'Contracts without signed PDF', table: 'Contracts', items: ds.contracts.filter((c) => !c.contractPdfLink).map((c) => `${c.id} · ${c.investorId}`) },
    { check: 'CRM deals without expected amount', table: 'CRM_Pipeline', items: ds.leads.filter((l) => !l.expectedAmount).map((l) => `${l.id} · ${l.name}`) },
    { check: 'Payments referencing unknown contract', table: 'Payouts_Paid', items: ds.payoutsPaid.filter((p) => !contractIds.has(p.contractId)).map((p) => `${p.reference} · ${p.contractId} · ${p.currency} ${p.amount.toLocaleString()}`) },
    { check: 'Duplicate bank references', table: 'Payouts_Paid', items: dupes(ds.payoutsPaid.map((p) => p.reference)) },
    { check: 'KYC expired', table: 'Investors', items: ds.investors.filter((i) => i.kycStatus === 'Expired').map((i) => `${i.id} · ${i.fullName}`) },
  ]
}

function dupes(xs: string[]) {
  const seen = new Set<string>()
  const d = new Set<string>()
  for (const x of xs) (seen.has(x) ? d : seen).add(x)
  return [...d]
}

