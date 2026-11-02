// Reads GSY_Data_Entry.xlsx (the workbook GSY fills in) into the app's Dataset.
// Runs entirely in the browser: the file is never uploaded anywhere.
// It is forgiving on purpose (renamed headings, typed-in names, numeric IDs, repeated rows)
// and records every correction or gap as an ImportIssue so Accounts can fix the source.

import * as XLSX from 'xlsx'
import { addMonths } from '../lib/dates'
import type {
  BankBalance, CommissionPaid, Company, Contract, Country, CountryCode, Currency, Dataset, Expense, ExpenseCategory, FxRate,
  InternalInvestment, Investor, Lead, PayoutPaid, PipelineStage, Product, SalesPerson, SyncSource,
} from './types'

export interface ImportIssue {
  level: 'error' | 'warning' | 'info'
  sheet: string
  message: string
}

export interface ImportSettings {
  overdueDays?: number
  cashCoverWarning?: number
  platinumAbove?: number
  goldAbove?: number
  answered: number
  questions: number
}

export interface ImportResult {
  ds: Dataset
  issues: ImportIssue[]
  counts: Record<string, number>
  settings: ImportSettings
  fileName: string
  importedAt: string
}

type Row = Record<string, unknown>

const COUNTRY_BY_NAME: Record<string, CountryCode> = { uae: 'AE', 'united arab emirates': 'AE', india: 'IN', malaysia: 'MY' }
const COUNTRIES: Country[] = [
  { code: 'AE', name: 'UAE', team: 'UAE Team', localCurrency: 'AED' },
  { code: 'IN', name: 'India', team: 'India Team', localCurrency: 'INR' },
  { code: 'MY', name: 'Malaysia', team: 'Malaysia Team', localCurrency: 'MYR' },
]
const CURRENCIES: Currency[] = ['AED', 'USD', 'INR', 'MYR', 'SGD']

/** Heading → key: lower case, letters and digits only. Aliases cover headings people commonly rename. */
const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const ALIASES: Record<string, string> = {
  passporteidno: 'passportno', passportnumber: 'passportno', mobileno: 'mobile', phone: 'mobile', investorname: 'fullname', name: 'name',
}
const key = (h: unknown) => ALIASES[norm(h)] ?? norm(h)

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim())
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) && String(v).match(/[0-9]/) ? n : null
}
const pctVal = (v: unknown): number | null => {
  const n = num(v)
  if (n === null) return null
  return n > 1 ? n / 100 : n // "1.75" typed without % → 1.75%
}
/** Excel serial or text → ISO date (UTC, no timezone drift). */
function isoDate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000)
    return d.toISOString().slice(0, 10)
  }
  if (v instanceof Date) return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate())).toISOString().slice(0, 10)
  const s = String(v).trim()
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  const t = Date.parse(s)
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10)
}
const isExampleRow = (r: Row) => text(r.notes).toLowerCase().startsWith('example row')

function levenshtein(a: string, b: string) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return dp[a.length][b.length]
}

/** Read one sheet's table: headings on row 4, records from row 5. Optionally only columns [c0, c1). */
function readBlock(rows: unknown[][], c0 = 0, c1 = Infinity): Row[] {
  const head = (rows[3] ?? []).slice(c0, c1 === Infinity ? undefined : c1)
  const out: Row[] = []
  for (let r = 4; r < rows.length; r++) {
    const line = (rows[r] ?? []).slice(c0, c1 === Infinity ? undefined : c1)
    if (!line.some((v) => v !== null && v !== undefined && String(v).trim() !== '')) continue
    const row: Row = {}
    head.forEach((h, i) => { if (h !== null && h !== undefined && String(h).trim() !== '') row[key(h)] = line[i] ?? null })
    out.push(row)
  }
  return out
}

/** Setup holds several tables side by side; each has a title like "Companies: …" on row 3. */
function readSetup(rows: unknown[][]) {
  const titles = rows[2] ?? []
  const head = rows[3] ?? []
  const blocks: Record<string, Row[]> = {}
  for (let c = 0; c < head.length; c++) {
    if (!head[c]) continue
    const start = c
    while (c < head.length && head[c]) c++
    const title = text(titles[start]).split(':')[0].trim() || text(head[start])
    blocks[norm(title)] = readBlock(rows, start, c)
  }
  return blocks
}

export async function importWorkbook(file: File, today: string): Promise<ImportResult> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: false })
  const issues: ImportIssue[] = []
  const add = (level: ImportIssue['level'], sheet: string, message: string) => issues.push({ level, sheet, message })
  const sheet = (name: string): unknown[][] => {
    const ws = wb.Sheets[name] ?? wb.Sheets[Object.keys(wb.Sheets).find((n) => norm(n) === norm(name)) ?? '']
    if (!ws) {
      add('error', name, `Sheet “${name}” not found. Please do not rename sheets.`)
      return []
    }
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true }) as unknown[][]
  }

  // ------------------------------------------------------------ Setup
  const setup = readSetup(sheet('Setup'))
  const realRows = (rs: Row[] | undefined) => (rs ?? []).filter((r) => !isExampleRow(r))

  const companies: Company[] = realRows(setup.companies).filter((r) => text(r.companyname)).map((r) => ({
    id: text(r.companyname), name: text(r.companyname),
    type: /sub/i.test(text(r.companytype)) ? 'Sub-company' : 'Investment Co',
    country: COUNTRY_BY_NAME[text(r.country).toLowerCase()] ?? 'AE',
    commissionPct: pctVal(r.monthlycommission),
  }))
  const products: Product[] = realRows(setup.products).filter((r) => text(r.productname)).map((r) => ({
    id: text(r.productname), name: text(r.productname), tenureMonths: num(r.months) ?? 12,
    monthlyProfitPct: pctVal(r.monthlyprofit) ?? 0,
    payoutFrequency: /3|quarter/i.test(text(r.profitpaid)) ? 'Quarterly' : /end|maturity/i.test(text(r.profitpaid)) ? 'Maturity' : 'Monthly',
    companyCommissionPct: pctVal(r.companycommission),
  }))
  const salesPeople: SalesPerson[] = realRows(setup.salesteam).filter((r) => text(r.name)).map((r) => ({
    id: text(r.name), name: text(r.name), type: /free/i.test(text(r.staffobfreelancer) || text(r.stafforfreelancer)) ? 'Freelancer' : 'CRM Staff',
    country: COUNTRY_BY_NAME[text(r.country).toLowerCase()] ?? 'AE', commissionPct: pctVal(r.commission) ?? 0,
    paymentMethod: /one/i.test(text(r.commissionpaid)) ? 'One-time' : 'Monthly',
  }))
  const fxRates: FxRate[] = realRows(setup.exchangerates).flatMap((r) => {
    const d = isoDate(r.month)
    const cur = text(r.currency).toUpperCase() as Currency
    const rate = num(r['1unitinaed'])
    return d && rate && CURRENCIES.includes(cur) ? [{ currency: cur, month: d.slice(0, 7), rateToAED: rate }] : []
  })

  // Lookups that forgive case, spacing and small typos.
  function matcher<T extends { id: string; name: string }>(list: T[], label: string, sheetName: string, create?: (name: string) => T) {
    const fixed = new Map<string, string>()
    return (raw: unknown): string | null => {
      const s = text(raw)
      if (!s) return null
      const exact = list.find((x) => x.name === s)
      if (exact) return exact.id
      const ci = list.find((x) => norm(x.name) === norm(s))
      if (ci) return ci.id
      const close = list.map((x) => ({ x, d: levenshtein(norm(x.name), norm(s)) })).sort((a, b) => a.d - b.d)[0]
      if (close && close.d <= 2) {
        if (!fixed.has(s)) { fixed.set(s, close.x.name); add('warning', sheetName, `${label} “${s}” was typed by hand; matched to “${close.x.name}”. Please pick from the list.`) }
        return close.x.id
      }
      if (create) {
        const made = create(s)
        list.push(made)
        add('warning', sheetName, `${label} “${s}” is not in Setup. Added it, but please add it to Setup with the correct details.`)
        return made.id
      }
      add('error', sheetName, `${label} “${s}” is not in Setup and was left out.`)
      return null
    }
  }
  const findSales = matcher(salesPeople, 'Salesperson', 'Setup → Sales Team', (n) => ({ id: n, name: n, type: 'CRM Staff', country: 'AE', commissionPct: 0, paymentMethod: 'One-time' }))
  const findProduct = matcher(products, 'Product', '2 Investments')
  const findCompany = matcher(companies, 'Company', 'Setup → Companies')

  // ------------------------------------------------------------ Investors (merge repeated rows)
  const invRows = realRows(readBlock(sheet('1 Investors')))
  const investors: Investor[] = []
  let repeats = 0
  for (const r of invRows) {
    const id = text(r.investorid)
    if (!id) { add('error', '1 Investors', `A row for “${text(r.fullname) || 'unknown'}” has no Investor ID and was left out.`); continue }
    if (investors.some((x) => x.id === id)) { repeats++; continue }
    const sales = findSales(r.salesperson)
    const kyc = text(r.kycstatus)
    investors.push({
      id, fullName: text(r.fullname) || id,
      country: COUNTRY_BY_NAME[text(r.country).toLowerCase()] ?? 'AE', city: text(r.city),
      phone: text(r.mobile), email: text(r.email), dateOfBirth: isoDate(r.dateofbirth),
      passportNo: text(r.passportno), passportExpiry: isoDate(r.passportexpiry), emiratesIdExpiry: isoDate(r.emiratesidexpiry),
      kycStatus: /done|verif/i.test(kyc) ? 'Verified' : /expir/i.test(kyc) ? 'Expired' : 'Pending',
      documentFolderLink: text(r.kycdocumentslink), assignedSalesId: sales ?? '',
    })
    if (!kyc) add('info', '1 Investors', `KYC Status is empty for ${id}; shown as Pending.`)
  }
  if (repeats) add('warning', '1 Investors', `${repeats} repeated investor rows were merged (each investor needs only one row; contracts go in sheet 2).`)

  // ------------------------------------------------------------ Contracts
  const contracts: Contract[] = []
  for (const r of realRows(readBlock(sheet('2 Investments')))) {
    const id = text(r.contractno)
    const investorId = text(r.investorid)
    const productId = findProduct(r.product)
    const amount = num(r.amount)
    const start = isoDate(r.startdate)
    if (!id || !investorId || !productId || !amount || !start) {
      add('error', '2 Investments', `Contract ${id || '(no number)'} is missing ${[!investorId && 'Investor ID', !productId && 'Product', !amount && 'Amount', !start && 'Start Date'].filter(Boolean).join(', ')} and was left out.`)
      continue
    }
    if (contracts.some((c) => c.id === id)) { add('error', '2 Investments', `Contract No ${id} is used twice; the second row was left out.`); continue }
    if (!investors.some((i) => i.id === investorId)) add('error', '2 Investments', `Contract ${id}: Investor ID ${investorId} is not in sheet 1.`)
    const product = products.find((p) => p.id === productId)!
    const tenure = num(r.specialmonths) ?? product.tenureMonths
    const end = addMonths(start, tenure)
    const status = text(r.status)
    const companyId = findCompany(r.company) ?? companies.find((c) => c.type === 'Investment Co')?.id ?? ''
    const salesId = findSales(r.salesperson) ?? ''
    contracts.push({
      id, investorId, companyId, productId, salesId,
      currency: (CURRENCIES.includes(text(r.currency).toUpperCase() as Currency) ? text(r.currency).toUpperCase() : 'AED') as Currency,
      amount, startDate: start, tenureMonths: tenure, endDate: end,
      monthlyProfitPct: pctVal(r.specialprofit) ?? product.monthlyProfitPct,
      status: /closed/i.test(status) ? 'Closed early' : /finish|matur/i.test(status) ? 'Matured' : end < today ? 'Matured' : 'Active',
      renewalStatus: /will/i.test(text(r.renewalplan)) ? 'Renewing' : /not|decid/i.test(text(r.renewalplan)) ? 'Undecided' : /back/i.test(text(r.renewalplan)) ? 'Returning capital' : '—',
      contractPdfLink: text(r.contractpdflink) || null,
    })
  }
  const noStatus = contracts.length && realRows(readBlock(sheet('2 Investments'))).filter((r) => !text(r.status)).length
  if (noStatus) add('info', '2 Investments', `${noStatus} contracts have no Status; worked out from the dates.`)

  // ------------------------------------------------------------ Payouts paid
  const payoutsPaid: PayoutPaid[] = []
  let undated = 0
  let notCleared = 0
  for (const [i, r] of realRows(readBlock(sheet('3 Payouts Paid'))).entries()) {
    const date = isoDate(r.paymentdate)
    const amount = num(r.amountpaid)
    if (!date || !amount) { undated++; continue }
    const status = text(r.paymentstatus)
    if (status && !/paid/i.test(status)) { notCleared++; continue }
    const contract = contracts.find((c) => c.id === text(r.contractno))
    payoutsPaid.push({ id: `PO-${i + 1}`, contractId: text(r.contractno), paidDate: date, amount, currency: (text(r.currency).toUpperCase() as Currency) || contract?.currency || 'AED', reference: text(r.bankreference) })
  }
  if (undated) add('error', '3 Payouts Paid', `${undated} payment rows have no Payment Date or Amount Paid, so they are not counted. Until payments are entered, every profit due will show as unpaid / overdue.`)
  if (notCleared) add('info', '3 Payouts Paid', `${notCleared} payments are not cleared yet and are not counted as paid.`)
  if (realRows(readBlock(sheet('3 Payouts Paid'))).some((r) => /^\s*[A-Z]{2}\d{2}[A-Z0-9]{10,}/.test(text(r.bankreference))))
    add('warning', '3 Payouts Paid', 'Bank Reference contains an IBAN (account number). Please enter the bank’s transaction reference for each payment instead.')

  // ------------------------------------------------------------ Commission paid
  const commissionsPaid: CommissionPaid[] = []
  for (const [i, r] of realRows(readBlock(sheet('4 Commission Paid'))).entries()) {
    const date = isoDate(r.paymentdate)
    const amount = num(r.amount)
    const salesId = findSales(r.salesperson)
    if (!date || !amount || !salesId) { add('error', '4 Commission Paid', `Row ${i + 1} is missing date, amount or salesperson and was left out.`); continue }
    commissionsPaid.push({ id: `CP-${i + 1}`, salesId, contractId: text(r.contractno), paidDate: date, amount, currency: (text(r.currency).toUpperCase() as Currency) || 'AED', reference: text(r.reference) })
  }

  // ------------------------------------------------------------ Expenses
  const expenses: Expense[] = []
  for (const [i, r] of realRows(readBlock(sheet('5 Expenses'))).entries()) {
    const date = isoDate(r.date)
    const amount = num(r.amount)
    if (!date || !amount) { add('error', '5 Expenses', `Expense row ${i + 1} is missing Date or Amount and was left out.`); continue }
    const t = text(r.expensetype)
    expenses.push({
      id: `EX-${i + 1}`, date, companyId: findCompany(r.company) ?? '', country: COUNTRY_BY_NAME[text(r.country).toLowerCase()] ?? 'AE',
      category: (['Salary', 'Rent', 'Marketing'].find((c) => c.toLowerCase() === t.toLowerCase()) ?? 'Other') as ExpenseCategory,
      amount, currency: (text(r.currency).toUpperCase() as Currency) || 'AED',
    })
  }

  // ------------------------------------------------------------ Sub-company transfers (skip the untouched example)
  const internalInvestments: InternalInvestment[] = []
  for (const [i, r] of realRows(readBlock(sheet('6 Sub-company Transfers'))).entries()) {
    if (text(r.bankreference) === 'TRF-260610-01' && num(r.amount) === 500000) { add('info', '6 Sub-company Transfers', 'The example transfer row was left unchanged and was ignored.'); continue }
    const date = isoDate(r.date)
    const amount = num(r.amount)
    const to = findCompany(r.tocompany)
    if (!date || !amount || !to) { add('error', '6 Sub-company Transfers', `Transfer row ${i + 1} is incomplete and was left out.`); continue }
    const back = /return/i.test(text(r.moneysentorreturned))
    internalInvestments.push({
      id: `TR-${i + 1}`, date, fromCompanyId: findCompany(r.fromcompany) ?? '', toCompanyId: to,
      country: companies.find((c) => c.id === to)?.country ?? 'AE', amount: back ? -Math.abs(amount) : Math.abs(amount),
      currency: (text(r.currency).toUpperCase() as Currency) || 'AED', purpose: text(r.purpose) || (back ? 'Repayment to group' : 'Investment'),
    })
  }

  // ------------------------------------------------------------ Sales leads
  const STAGE: [RegExp, PipelineStage][] = [[/invest|fund/i, 'Funded'], [/lost/i, 'Lost'], [/kyc/i, 'KYC'], [/propos/i, 'Proposal'], [/meet/i, 'Meeting'], [/./, 'Lead']]
  const leads: Lead[] = []
  for (const [i, r] of realRows(readBlock(sheet('7 Sales Leads'))).entries()) {
    const created = isoDate(r.dateadded)
    const name = text(r.leadname)
    if (!name || !created) { add('error', '7 Sales Leads', `Lead row ${i + 1} is missing name or Date Added and was left out.`); continue }
    if (created > today) add('warning', '7 Sales Leads', `Lead “${name}”: Date Added (${created}) is in the future.`)
    const last = isoDate(r.lastcontactdate)
    if (!last) add('info', '7 Sales Leads', `Lead “${name}” has no Last Contact Date; Date Added is used.`)
    const src = text(r.leadsource)
    leads.push({
      id: `LD-${i + 1}`, name, createdDate: created, salesId: findSales(r.salesperson) ?? '',
      stage: STAGE.find(([re]) => re.test(text(r.stage)))![1], expectedAmount: num(r.expectedamount),
      currency: (text(r.currency).toUpperCase() as Currency) || 'AED', productId: findProduct(r.product) ?? products[0]?.id ?? '',
      lastActivityDate: last ?? created, nextAction: text(r.nextstep) || '—',
      source: (/refer/i.test(src) ? 'Referral' : /social/i.test(src) ? 'Social media' : /event/i.test(src) ? 'Events' : /free/i.test(src) ? 'Freelancer' : 'Website') as Lead['source'],
    })
  }

  // ------------------------------------------------------------ Bank balance
  const bankBalances: BankBalance[] = realRows(readBlock(sheet('8 Bank Balance'))).flatMap((r) => {
    const d = isoDate(r.date)
    const bal = num(r.balance)
    return d && bal !== null ? [{ account: [text(r.bankname), text(r.accountname)].filter(Boolean).join(' · '), currency: (text(r.currency).toUpperCase() as Currency) || 'AED', balance: bal, asOf: d }] : []
  })

  // ------------------------------------------------------------ Company Info answers
  const info = readBlock(sheet('Company Info'))
  const answer = (re: RegExp) => info.find((r) => re.test(text(r.question)))?.answer
  const answered = info.filter((r) => text(r.answer)).length
  const settings: ImportSettings = {
    overdueDays: num(answer(/overdue/i)) ?? undefined,
    cashCoverWarning: num(answer(/cash covers/i)) ?? undefined,
    platinumAbove: num(answer(/platinum/i)) ?? undefined,
    goldAbove: num(answer(/gold investor/i)) ?? undefined,
    answered, questions: info.length,
  }

  // ------------------------------------------------------------ completeness checks
  const used = new Set([...contracts.map((c) => c.salesId), ...investors.map((i) => i.assignedSalesId), ...leads.map((l) => l.salesId)])
  const usedCo = new Set([...contracts.map((c) => c.companyId), ...expenses.map((e) => e.companyId), ...internalInvestments.flatMap((t) => [t.fromCompanyId, t.toCompanyId])])
  const usedPr = new Set([...contracts.map((c) => c.productId), ...leads.map((l) => l.productId)])
  const ds: Dataset = {
    countries: COUNTRIES,
    companies: companies.filter((c) => usedCo.has(c.id) || !isTemplateCompany(c.name)),
    products: products.filter((p) => usedPr.has(p.id) || !isTemplateProduct(p.name)),
    salesPeople: salesPeople.filter((s) => used.has(s.id) || !isTemplateSales(s.name)),
    investors, contracts, payoutsPaid, commissionsPaid, expenses, internalInvestments, leads, fxRates, bankBalances, syncLog: [],
  }
  if (companies.some((c) => isTemplateCompany(c.name)) || products.some((p) => isTemplateProduct(p.name)))
    add('warning', 'Setup', 'Setup still contains the example companies / products / sales team from the template. Please replace them with GSY’s real names and percentages: payouts and commissions are calculated from them.')
  if (!bankBalances.length) add('warning', '8 Bank Balance', 'No bank balance entered, so the cash cover (liquidity) figure cannot be calculated.')
  if (!commissionsPaid.length) add('info', '4 Commission Paid', 'No commission payments entered yet; all earned commission shows as payable.')
  if (answered < info.length) add('info', 'Company Info', `${answered} of ${info.length} questions answered.`)
  const users = realRows(readBlock(sheet('Users & Access')))
  if (!users.length) add('info', 'Users & Access', 'No users listed yet.')

  const counts: Record<string, number> = {
    Investors: investors.length, Investments: contracts.length, 'Payouts paid': payoutsPaid.length, 'Commission paid': commissionsPaid.length,
    Expenses: expenses.length, 'Sub-company transfers': internalInvestments.length, 'Sales leads': leads.length, 'Bank balances': bankBalances.length,
    Companies: ds.companies.length, Products: ds.products.length, 'Sales team': ds.salesPeople.length, 'Exchange rates': fxRates.length,
  }
  const importedAt = new Date().toISOString()
  const status = (n: number, hasErr: boolean): SyncSource['status'] => (hasErr ? 'Warning' : n ? 'OK' : 'Warning')
  const errIn = (s: string) => issues.some((i) => i.sheet.startsWith(s) && i.level !== 'info')
  ds.syncLog = ([
    ['Investors', '1 Investors', investors.length], ['Contracts', '2 Investments', contracts.length], ['Payouts_Paid', '3 Payouts Paid', payoutsPaid.length],
    ['Commission_Paid', '4 Commission Paid', commissionsPaid.length], ['Expenses', '5 Expenses', expenses.length], ['Internal_Investments', '6 Sub-company Transfers', internalInvestments.length],
    ['CRM_Pipeline', '7 Sales Leads', leads.length], ['Bank_Balance', '8 Bank Balance', bankBalances.length], ['FX_Rates', 'Setup', fxRates.length],
  ] as const).map(([table, sh, n]) => ({
    table, source: `${file.name} › ${sh}`, lastSync: importedAt, rows: n, status: status(n, errIn(sh)),
    note: issues.filter((i) => i.sheet.startsWith(sh) && i.level !== 'info').map((i) => i.message).join(' ') || '',
  }))
  return { ds, issues, counts, settings, fileName: file.name, importedAt }
}

// Names from the template's own example rows, used to spot setup rows nobody replaced.
const isTemplateCompany = (n: string) => /^(GSY Investment Company [AB]|Real Estate Sub-company)$/.test(n)
const isTemplateProduct = (n: string) => /^(Fixed 12 Months|Fixed 24 Months|Growth Plan 24 Months)$/.test(n)
const isTemplateSales = (n: string) => /^(Omar Haddad|Layla Karim|Arjun Menon)$/.test(n)
