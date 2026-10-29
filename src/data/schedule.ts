import { addMonths } from '../lib/dates'
import type { CommissionScheduleRow, Company, Contract, PayoutScheduleRow, Product, SalesPerson } from './types'

const STEP = { Monthly: 1, Quarterly: 3, Maturity: 0 } as const

/**
 * Payout schedule for one contract (brief §6 Fact_Payout_Schedule).
 * Monthly profit = amount × monthly profit %. Capital is returned with the final payout.
 * Quarterly pays 3 months of profit every 3 months; Maturity pays all profit + capital at the end.
 */
export function buildPayoutSchedule(c: Contract, p: Product): PayoutScheduleRow[] {
  const step = STEP[p.payoutFrequency] || c.tenureMonths
  const monthly = c.amount * c.monthlyProfitPct
  const rows: PayoutScheduleRow[] = []
  let prev = 0
  for (let n = step; prev < c.tenureMonths; n = Math.min(n + step, c.tenureMonths)) {
    const months = n - prev
    const capital = n === c.tenureMonths ? c.amount : 0
    const profit = monthly * months
    rows.push({
      key: `${c.id}#${n}`,
      contractId: c.id,
      monthNo: n,
      dueDate: addMonths(c.startDate, n),
      profitDue: profit,
      capitalDue: capital,
      totalDue: profit + capital,
      currency: c.currency,
      paid: 0,
      lastPaidDate: null,
    })
    prev = n
  }
  return rows
}

export function companyCommissionRate(product: Product, company: Company): number {
  return product.companyCommissionPct ?? company.commissionPct ?? 0
}

/**
 * Commission schedule (brief §3).
 * Company: active amount × company % for every month the contract runs.
 * CRM: one-time = amount × % on funding; monthly = amount × % ÷ tenure each month.
 */
export function buildCommissionSchedule(c: Contract, product: Product, company: Company, sp: SalesPerson | undefined): CommissionScheduleRow[] {
  const rows: CommissionScheduleRow[] = []
  const rate = companyCommissionRate(product, company)
  for (let n = 1; n <= c.tenureMonths; n++) {
    rows.push({ contractId: c.id, type: 'Company', salesId: null, date: addMonths(c.startDate, n), amount: c.amount * rate, currency: c.currency })
  }
  if (sp) {
    const total = c.amount * sp.commissionPct
    if (sp.paymentMethod === 'One-time') {
      rows.push({ contractId: c.id, type: 'CRM', salesId: sp.id, date: c.startDate, amount: total, currency: c.currency })
    } else {
      for (let n = 1; n <= c.tenureMonths; n++) {
        rows.push({ contractId: c.id, type: 'CRM', salesId: sp.id, date: addMonths(c.startDate, n), amount: total / c.tenureMonths, currency: c.currency })
      }
    }
  }
  return rows
}
