// SAMPLE DATA ONLY. A deterministic generator that mimics the 13 Excel tables in the brief.
// It is replaced by GSY's real Excel records in the integration step; nothing here is a real investor.

import { addDays, addMonthKey, addMonths, daysBetween, monthKey, startOfMonth } from '../lib/dates'
import { buildCommissionSchedule, buildPayoutSchedule } from './schedule'
import type {
  BankBalance, CommissionPaid, Company, Contract, Country, CountryCode, Currency, Dataset, Expense, ExpenseCategory,
  FxRate, InternalInvestment, Investor, Lead, PayoutPaid, PipelineStage, Product, SalesPerson, SyncSource,
} from './types'

function rng(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function generateSampleData(today: string): Dataset {
  const r = rng(20261029)
  const int = (a: number, b: number) => a + Math.floor(r() * (b - a + 1))
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]
  const chance = (p: number) => r() < p
  const weighted = <T,>(pairs: readonly (readonly [T, number])[]): T => {
    let x = r() * pairs.reduce((s, [, w]) => s + w, 0)
    for (const [v, w] of pairs) if ((x -= w) <= 0) return v
    return pairs[pairs.length - 1][0]
  }

  const countries: Country[] = [
    { code: 'AE', name: 'UAE', team: 'UAE Team', localCurrency: 'AED' },
    { code: 'IN', name: 'India', team: 'India Team', localCurrency: 'INR' },
    { code: 'MY', name: 'Malaysia', team: 'Malaysia Team', localCurrency: 'MYR' },
  ]

  const companies: Company[] = [
    { id: 'C01', name: 'Investment Company A', type: 'Investment Co', country: 'AE', commissionPct: 0.005 },
    { id: 'C02', name: 'Investment Company B', type: 'Investment Co', country: 'AE', commissionPct: 0.004 },
    { id: 'S01', name: 'Real Estate Sub-co', type: 'Sub-company', country: 'AE', commissionPct: null },
    { id: 'S02', name: 'Trading Sub-co', type: 'Sub-company', country: 'IN', commissionPct: null },
    { id: 'S03', name: 'Hospitality Sub-co', type: 'Sub-company', country: 'MY', commissionPct: null },
    { id: 'S04', name: 'Logistics Sub-co', type: 'Sub-company', country: 'AE', commissionPct: null },
  ]

  const products: Product[] = [
    { id: 'P1', name: 'Fixed 12M', tenureMonths: 12, monthlyProfitPct: 0.0125, payoutFrequency: 'Monthly', companyCommissionPct: null },
    { id: 'P2', name: 'Fixed 18M', tenureMonths: 18, monthlyProfitPct: 0.015, payoutFrequency: 'Quarterly', companyCommissionPct: null },
    { id: 'P3', name: 'Fixed 24M', tenureMonths: 24, monthlyProfitPct: 0.0175, payoutFrequency: 'Monthly', companyCommissionPct: null },
    { id: 'P4', name: 'Fixed 36M', tenureMonths: 36, monthlyProfitPct: 0.02, payoutFrequency: 'Monthly', companyCommissionPct: 0.0045 },
    { id: 'P5', name: 'Growth Plan 24M', tenureMonths: 24, monthlyProfitPct: 0.018, payoutFrequency: 'Maturity', companyCommissionPct: 0.006 },
  ]

  const salesPeople: SalesPerson[] = [
    { id: 'SP01', name: 'Omar Haddad', type: 'CRM Staff', country: 'AE', commissionPct: 0.015, paymentMethod: 'Monthly' },
    { id: 'SP02', name: 'Fatima Noor', type: 'CRM Staff', country: 'AE', commissionPct: 0.015, paymentMethod: 'One-time' },
    { id: 'SP03', name: 'Daniel Mathew', type: 'CRM Staff', country: 'AE', commissionPct: 0.0175, paymentMethod: 'Monthly' },
    { id: 'SP04', name: 'Layla Karim', type: 'Freelancer', country: 'AE', commissionPct: 0.03, paymentMethod: 'One-time' },
    { id: 'SP05', name: 'Yousef Saleh', type: 'Freelancer', country: 'AE', commissionPct: 0.025, paymentMethod: 'Monthly' },
    { id: 'SP06', name: 'Arjun Menon', type: 'CRM Staff', country: 'IN', commissionPct: 0.02, paymentMethod: 'One-time' },
    { id: 'SP07', name: 'Priya Nair', type: 'CRM Staff', country: 'IN', commissionPct: 0.02, paymentMethod: 'Monthly' },
    { id: 'SP08', name: 'Rahul Varma', type: 'Freelancer', country: 'IN', commissionPct: 0.03, paymentMethod: 'One-time' },
    { id: 'SP09', name: 'Aisyah Rahman', type: 'CRM Staff', country: 'MY', commissionPct: 0.018, paymentMethod: 'Monthly' },
    { id: 'SP10', name: 'Kelvin Tan', type: 'Freelancer', country: 'MY', commissionPct: 0.03, paymentMethod: 'One-time' },
  ]

  // ---------- FX (monthly rate to AED) ----------
  const BASE: Record<Currency, number> = { AED: 1, USD: 3.6725, INR: 0.0436, MYR: 0.792, SGD: 2.79 }
  const firstMonth = addMonthKey(monthKey(today), -40)
  const fxRates: FxRate[] = []
  for (let k = firstMonth, i = 0; k <= addMonthKey(monthKey(today), 12); k = addMonthKey(k, 1), i++) {
    for (const cur of Object.keys(BASE) as Currency[]) {
      const drift = cur === 'AED' || cur === 'USD' ? 0 : Math.sin(i / 5 + cur.length) * 0.025 - (cur === 'INR' ? i * 0.0006 : 0)
      fxRates.push({ currency: cur, month: k, rateToAED: +(BASE[cur] * (1 + drift)).toFixed(cur === 'INR' ? 5 : 4) })
    }
  }
  const fx = (cur: Currency, iso: string) => fxRates.find((f) => f.currency === cur && f.month === monthKey(iso))?.rateToAED ?? BASE[cur]

  // ---------- Investors ----------
  const FIRST: Record<CountryCode, string[]> = {
    AE: ['Ahmed', 'Mariam', 'Khalid', 'Noura', 'Saeed', 'Huda', 'Rashid', 'Aisha', 'Faisal', 'Sara', 'Hamdan', 'Reem', 'John', 'Elena', 'Victor'],
    IN: ['Rajesh', 'Anita', 'Suresh', 'Kavya', 'Vikram', 'Meera', 'Arvind', 'Deepa', 'Sanjay', 'Lakshmi', 'Nikhil', 'Pooja'],
    MY: ['Ahmad', 'Nur', 'Wei Ling', 'Hafiz', 'Siti', 'Jason', 'Mei', 'Azlan', 'Farah', 'Daniel'],
  }
  const LAST: Record<CountryCode, string[]> = {
    AE: ['Al Mansoori', 'Al Hashimi', 'Al Suwaidi', 'Khan', 'Rahman', 'Al Marri', 'Petrov', 'Fernandes', 'Al Nuaimi', 'Siddiqui'],
    IN: ['Kumar', 'Sharma', 'Pillai', 'Reddy', 'Iyer', 'Nair', 'Gupta', 'Joseph', 'Menon', 'Shah'],
    MY: ['Abdullah', 'Lim', 'Tan', 'Ismail', 'Wong', 'Hassan', 'Lee', 'Yusof', 'Chong'],
  }
  const CITY: Record<CountryCode, string[]> = {
    AE: ['Dubai', 'Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman'],
    IN: ['Kochi', 'Mumbai', 'Bengaluru', 'Chennai', 'Hyderabad', 'Kozhikode'],
    MY: ['Kuala Lumpur', 'Penang', 'Johor Bahru', 'Shah Alam'],
  }
  const investors: Investor[] = []
  const countryPlan: CountryCode[] = [...Array(30).fill('AE'), ...Array(20).fill('IN'), ...Array(14).fill('MY')]
  countryPlan.forEach((cc, i) => {
    const id = `INV-${String(i + 1).padStart(4, '0')}`
    const fullName = `${pick(FIRST[cc])} ${pick(LAST[cc])}`
    let dob: string | null = `${int(1958, 1996)}-${String(int(1, 12)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`
    // Seed birthday reminders: two within 2 days, one later this week.
    const bdayOffset = i === 3 ? 1 : i === 21 ? 2 : i === 40 ? 5 : null
    if (bdayOffset !== null) dob = `${int(1965, 1990)}${addDays(today, bdayOffset).slice(4)}`
    if (i === 17 || i === 52) dob = null // missing DOB -> data quality
    const passportExpiry = i === 9 ? addDays(today, 12) : i === 33 ? addDays(today, -20) : i === 47 ? addDays(today, 26) : addDays(today, int(200, 2800))
    const spPool = salesPeople.filter((s) => s.country === cc)
    investors.push({
      id, fullName, country: cc, city: pick(CITY[cc]),
      phone: cc === 'AE' ? `+971 5${int(0, 8)} ${int(100, 999)} ${int(1000, 9999)}` : cc === 'IN' ? `+91 9${int(100, 999)} ${int(10000, 99999)}` : `+60 1${int(1, 9)}-${int(100, 999)} ${int(1000, 9999)}`,
      email: `${fullName.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`,
      dateOfBirth: dob,
      passportNo: `${cc === 'AE' ? 'P' : cc === 'IN' ? 'Z' : 'A'}${int(1000000, 9999999)}`,
      passportExpiry,
      emiratesIdExpiry: cc === 'AE' ? (i === 5 ? addDays(today, 18) : addDays(today, int(90, 1000))) : null,
      kycStatus: passportExpiry < today ? 'Expired' : chance(0.06) ? 'Pending' : 'Verified',
      documentFolderLink: `https://sharepoint.example/gsy/investors/${id}`,
      assignedSalesId: pick(spPool).id,
    })
  })

  // ---------- Contracts ----------
  const CUR_MIX: Record<CountryCode, [Currency, number][]> = {
    AE: [['AED', 0.7], ['USD', 0.3]],
    IN: [['INR', 0.75], ['USD', 0.25]],
    MY: [['MYR', 0.7], ['SGD', 0.3]],
  }
  const STEP: Record<Currency, number> = { AED: 5000, USD: 1000, INR: 100000, MYR: 5000, SGD: 1000 }
  const contracts: Contract[] = []
  let cSeq = 100
  investors.forEach((inv, i) => {
    const n = weighted([[1, 0.55], [2, 0.3], [3, 0.15]])
    for (let k = 0; k < n; k++) {
      const product = weighted<Product>([[products[0], 0.22], [products[1], 0.18], [products[2], 0.28], [products[3], 0.17], [products[4], 0.15]])
      const forcedNew = contracts.length % 23 === 0 && contracts.length > 0
      const forcedExpiry = contracts.length % 13 === 6
      const startDate = forcedNew || (i < 4 && k === 0)
        ? addDays(startOfMonth(today), int(0, Math.max(0, daysBetween(startOfMonth(today), today))))
        : forcedExpiry
          ? addMonths(addDays(startOfMonth(today), int(0, 27)), -product.tenureMonths)
          : addDays(today, -int(20, 36 * 30))
      const currency = weighted(CUR_MIX[inv.country])
      const aedTarget = Math.exp(Math.log(50000) + r() * (Math.log(1200000) - Math.log(50000)))
      const amount = Math.max(STEP[currency], Math.round(aedTarget / fx(currency, startDate) / STEP[currency]) * STEP[currency])
      const endDate = addMonths(startDate, product.tenureMonths)
      const sp = r() < 0.85 ? inv.assignedSalesId : pick(salesPeople.filter((s) => s.country === inv.country)).id
      const daysToEnd = daysBetween(today, endDate)
      contracts.push({
        id: `CT-${++cSeq}`,
        investorId: inv.id,
        companyId: chance(0.6) ? 'C01' : 'C02',
        productId: product.id,
        salesId: sp,
        currency,
        amount,
        startDate,
        tenureMonths: product.tenureMonths,
        endDate,
        monthlyProfitPct: product.monthlyProfitPct,
        status: endDate < today ? 'Matured' : 'Active',
        renewalStatus: daysToEnd >= -10 && daysToEnd <= 120 ? weighted([['Renewing', 0.45], ['Undecided', 0.35], ['Returning capital', 0.2]] as const) : '—',
        contractPdfLink: chance(0.05) ? null : `https://sharepoint.example/gsy/contracts/CT-${cSeq}.pdf`,
      })
    }
  })

  const productById = new Map(products.map((p) => [p.id, p]))
  const companyById = new Map(companies.map((c) => [c.id, c]))
  const spById = new Map(salesPeople.map((s) => [s.id, s]))

  // ---------- Payouts paid (bank references) ----------
  const payoutsPaid: PayoutPaid[] = []
  let pSeq = 1
  const ref = (prefix: string, d: string) => `${prefix}-${d.slice(2, 4)}${d.slice(5, 7)}-${String(pSeq++).padStart(5, '0')}`
  for (const c of contracts) {
    for (const row of buildPayoutSchedule(c, productById.get(c.productId)!)) {
      if (row.dueDate > today) continue
      const age = daysBetween(row.dueDate, today)
      if (age <= 40 && chance(0.06)) continue // overdue, not paid yet
      const partial = age <= 40 && chance(0.03)
      const paidDate = addDays(row.dueDate, Math.min(age, weighted([[0, 0.7], [1, 0.25], [3, 0.05]])))
      payoutsPaid.push({ id: `PO-${pSeq}`, contractId: c.id, paidDate, amount: partial ? Math.round(row.totalDue / 2) : Math.round(row.totalDue * 100) / 100, currency: c.currency, reference: ref('BNK', paidDate) })
    }
  }
  // An unmatched bank payment, so the reconciliation page has something to flag.
  payoutsPaid.push({ id: `PO-${pSeq}`, contractId: 'CT-9999', paidDate: addDays(today, -3), amount: 4500, currency: 'AED', reference: ref('BNK', addDays(today, -3)) })

  // ---------- Commission payments ----------
  const commissionsPaid: CommissionPaid[] = []
  const monthCompanyComm = new Map<string, number>()
  for (const c of contracts) {
    const rows = buildCommissionSchedule(c, productById.get(c.productId)!, companyById.get(c.companyId)!, spById.get(c.salesId))
    for (const row of rows) {
      if (row.type === 'Company') {
        const k = `${c.companyId}|${monthKey(row.date)}`
        monthCompanyComm.set(k, (monthCompanyComm.get(k) ?? 0) + row.amount * fx(row.currency, row.date))
        continue
      }
      if (row.date >= startOfMonth(today) || chance(0.08)) continue
      const paidDate = addDays(row.date, int(3, 10))
      if (paidDate > today) continue
      commissionsPaid.push({ id: `CP-${pSeq}`, salesId: row.salesId!, contractId: c.id, paidDate, amount: Math.round(row.amount * 100) / 100, currency: row.currency, reference: ref('COM', paidDate) })
    }
  }

  // ---------- Expenses (sized so commission roughly covers them) ----------
  const expenses: Expense[] = []
  const SPLIT: [ExpenseCategory, number, number][] = [['Salary', 0.5, 28], ['Rent', 0.15, 1], ['Marketing', 0.2, 12], ['Other', 0.15, 20]]
  const TEAMS: Record<string, [CountryCode, number][]> = { C01: [['AE', 0.65], ['IN', 0.35]], C02: [['AE', 0.6], ['MY', 0.4]] }
  let eSeq = 1
  for (let k = addMonthKey(monthKey(today), -24); k <= monthKey(today); k = addMonthKey(k, 1)) {
    for (const coId of ['C01', 'C02']) {
      const base = Math.max(30000, (monthCompanyComm.get(`${coId}|${k}`) ?? 0) * (0.72 + r() * 0.4))
      for (const [cc, share] of TEAMS[coId]) {
        const cur = countries.find((x) => x.code === cc)!.localCurrency
        for (const [cat, catShare, day] of SPLIT) {
          const date = `${k}-${String(day).padStart(2, '0')}`
          if (date > today) continue
          const aed = base * share * catShare
          expenses.push({ id: `EX-${eSeq++}`, date, companyId: coId, country: cc, category: cat, amount: Math.round(aed / fx(cur, date)), currency: cur })
        }
      }
    }
  }

  // ---------- Internal investments ----------
  const internalInvestments: InternalInvestment[] = []
  const PURPOSE = ['Project funding', 'Working capital', 'Land acquisition', 'Inventory', 'Fit-out & equipment']
  const subs = companies.filter((c) => c.type === 'Sub-company')
  for (let i = 0; i < 24; i++) {
    const to = subs[i % subs.length]
    const cur = countries.find((x) => x.code === to.country)!.localCurrency
    const date = addDays(today, -int(5, 720))
    const repay = i % 9 === 8
    const aed = (repay ? -1 : 1) * int(250, 1800) * 1000
    internalInvestments.push({ id: `TR-${String(i + 1).padStart(3, '0')}`, date, fromCompanyId: chance(0.6) ? 'C01' : 'C02', toCompanyId: to.id, country: to.country, amount: Math.round(aed / fx(cur, date) / 1000) * 1000, currency: cur, purpose: repay ? 'Repayment to group' : pick(PURPOSE) })
  }
  internalInvestments.sort((a, b) => a.date.localeCompare(b.date))

  // ---------- CRM pipeline ----------
  const leads: Lead[] = []
  const ACTIONS = ['Call back', 'Send proposal', 'Schedule meeting', 'Collect KYC documents', 'Follow up on transfer', 'Site visit']
  for (let i = 0; i < 84; i++) {
    const sp = pick(salesPeople)
    const cc = sp.country
    const stage = weighted<PipelineStage>([['Lead', 0.28], ['Meeting', 0.2], ['Proposal', 0.16], ['KYC', 0.1], ['Funded', 0.14], ['Lost', 0.12]])
    const created = addDays(today, -int(1, 100))
    const span = daysBetween(created, today)
    const stale = chance(0.22)
    const last = stale ? addDays(created, Math.max(0, span - int(8, Math.max(9, span)))) : addDays(today, -Math.min(span, int(0, 6)))
    const cur = weighted(CUR_MIX[cc])
    const aedTarget = int(60, 900) * 1000
    leads.push({
      id: `LD-${String(i + 1).padStart(4, '0')}`,
      name: `${pick(FIRST[cc])} ${pick(LAST[cc])}`,
      createdDate: created,
      salesId: sp.id,
      stage,
      expectedAmount: i === 12 || i === 50 || i === 71 ? null : Math.round(aedTarget / fx(cur, today) / STEP[cur]) * STEP[cur],
      currency: cur,
      productId: pick(products).id,
      lastActivityDate: last < created ? created : last,
      nextAction: stage === 'Funded' || stage === 'Lost' ? '—' : pick(ACTIONS),
      source: sp.type === 'Freelancer' ? 'Freelancer' : weighted([['Referral', 0.35], ['Social media', 0.3], ['Events', 0.2], ['Website', 0.15]] as const),
    })
  }

  // ---------- Bank balances (for liquidity cover) ----------
  let next90 = 0
  for (const c of contracts) for (const row of buildPayoutSchedule(c, productById.get(c.productId)!)) {
    if (row.dueDate > today && row.dueDate <= addDays(today, 90)) next90 += row.totalDue * fx(c.currency, row.dueDate)
  }
  const target = next90 * 1.38
  const BANK: [string, Currency, number][] = [['Main operating (AED)', 'AED', 0.55], ['USD account', 'USD', 0.22], ['India collection (INR)', 'INR', 0.11], ['Malaysia collection (MYR)', 'MYR', 0.08], ['SGD account', 'SGD', 0.04]]
  const bankBalances: BankBalance[] = BANK.map(([account, currency, share]) => ({ account, currency, balance: Math.round((target * share) / fx(currency, today)), asOf: addDays(today, -1) }))

  const t = (h: string) => `${today}T${h}:00+04:00`
  const syncLog: SyncSource[] = [
    { table: 'Contracts', source: 'SharePoint › GSY-Register.xlsx', lastSync: t('09:00'), rows: contracts.length, status: 'OK', note: 'Validated, no duplicates' },
    { table: 'Investors', source: 'SharePoint › GSY-Register.xlsx', lastSync: t('09:00'), rows: investors.length, status: 'Warning', note: '2 investors without date of birth' },
    { table: 'Payouts_Paid', source: 'SharePoint › Payout-Ledger.xlsx', lastSync: t('09:01'), rows: payoutsPaid.length, status: 'Warning', note: '1 payment references unknown contract' },
    { table: 'Commission_Paid', source: 'SharePoint › Commission-Payments.xlsx', lastSync: t('09:01'), rows: commissionsPaid.length, status: 'OK', note: '' },
    { table: 'Expenses', source: 'Accounting export (monthly)', lastSync: t('09:02'), rows: expenses.length, status: 'OK', note: '' },
    { table: 'Internal_Investments', source: 'SharePoint › GSY-Register.xlsx', lastSync: t('09:00'), rows: internalInvestments.length, status: 'OK', note: '' },
    { table: 'CRM_Pipeline', source: 'CRM export › SharePoint', lastSync: t('08:30'), rows: leads.length, status: 'Warning', note: '3 deals without expected amount' },
    { table: 'FX_Rates', source: 'Finance-maintained table', lastSync: t('09:00'), rows: fxRates.length, status: 'OK', note: '' },
    { table: 'Bank_Balance', source: 'Manual upload (bank statement)', lastSync: `${addDays(today, -1)}T18:10:00+04:00`, rows: bankBalances.length, status: 'Warning', note: 'Uploaded yesterday — stale > 12h' },
  ]

  return { countries, companies, products, salesPeople, investors, contracts, payoutsPaid, commissionsPaid, expenses, internalInvestments, leads, fxRates, bankBalances, syncLog }
}


