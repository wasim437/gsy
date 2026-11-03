// Database layer: loads GSY's records from Supabase into the app's Dataset, and saves edits.
// Row Level Security on the server decides what each signed-in person can read or change.

import { addMonths } from '../lib/dates'
import { supabase } from '../lib/supabase'
import type { ImportResult } from './importExcel'
import type { AuditEntry, Permission, RoleDef, User } from './store'
import type { Company, Contract, Country, CountryCode, Currency, Dataset, Investor, Lead, Product, SalesPerson, SyncSource } from './types'

export const TABLES = [
  'companies', 'products', 'sales_people', 'commission_by_product', 'fx_rates', 'sales_targets',
  'investors', 'contracts', 'payouts_paid', 'commissions_paid', 'expenses', 'transfers', 'leads', 'bank_balances', 'gifts', 'settings',
] as const
export type TableName = (typeof TABLES)[number]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbRow = Record<string, any>
export type RawTables = Record<TableName, DbRow[]>

const CODE: Record<string, CountryCode> = { UAE: 'AE', India: 'IN', Malaysia: 'MY' }
export const COUNTRY_NAME: Record<CountryCode, string> = { AE: 'UAE', IN: 'India', MY: 'Malaysia' }
const COUNTRIES: Country[] = [
  { code: 'AE', name: 'UAE', team: 'UAE Team', localCurrency: 'AED' },
  { code: 'IN', name: 'India', team: 'India Team', localCurrency: 'INR' },
  { code: 'MY', name: 'Malaysia', team: 'Malaysia Team', localCurrency: 'MYR' },
]

async function selectAll(table: TableName): Promise<DbRow[]> {
  const out: DbRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return out
}

export async function loadAll(): Promise<{ raw: RawTables; ds: Dataset; loadedAt: string }> {
  const lists = await Promise.all(TABLES.map(selectAll))
  const raw = Object.fromEntries(TABLES.map((t, i) => [t, lists[i]])) as RawTables
  const loadedAt = new Date().toISOString()
  return { raw, ds: toDataset(raw, loadedAt), loadedAt }
}

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v))

/** Database rows → the Dataset every dashboard already understands. */
export function toDataset(raw: RawTables, loadedAt: string): Dataset {
  const companies: Company[] = raw.companies.map((r) => ({
    id: r.id, name: r.name, type: r.company_type === 'Sub-company' ? 'Sub-company' : 'Investment Co',
    country: CODE[r.country] ?? 'AE', commissionPct: n(r.monthly_commission_pct),
  }))
  const products: Product[] = raw.products.map((r) => ({
    id: r.id, name: r.name, tenureMonths: r.months, monthlyProfitPct: Number(r.monthly_profit_pct),
    payoutFrequency: r.profit_paid === 'Every 3 months' ? 'Quarterly' : r.profit_paid === 'At the end' ? 'Maturity' : 'Monthly',
    companyCommissionPct: n(r.company_commission_pct),
  }))
  const salesPeople: SalesPerson[] = raw.sales_people.map((r) => ({
    id: r.id, name: r.name, type: r.staff_type === 'Freelancer' ? 'Freelancer' : 'CRM Staff', country: CODE[r.country] ?? 'AE',
    commissionPct: Number(r.commission_pct), paymentMethod: r.commission_paid === 'Every month' ? 'Monthly' : 'One-time',
  }))
  const invCode = new Map(raw.investors.map((r) => [r.id, r.investor_code as string]))
  const investors: Investor[] = raw.investors.map((r) => ({
    id: r.investor_code, fullName: r.full_name, country: CODE[r.country] ?? 'AE', city: r.city ?? '', phone: r.mobile ?? '', email: r.email ?? '',
    dateOfBirth: r.date_of_birth, passportNo: r.passport_no ?? '', passportExpiry: r.passport_expiry, emiratesIdExpiry: r.emirates_id_expiry,
    kycStatus: r.kyc_status === 'Done' ? 'Verified' : r.kyc_status === 'Expired' ? 'Expired' : 'Pending',
    documentFolderLink: r.kyc_documents_link ?? '', assignedSalesId: r.sales_person_id ?? '',
  }))
  const prod = new Map(products.map((p) => [p.id, p]))
  const ctCode = new Map(raw.contracts.map((r) => [r.id, r.contract_no as string]))
  const today = new Date().toISOString().slice(0, 10)
  const contracts: Contract[] = raw.contracts.map((r) => {
    const p = prod.get(r.product_id)
    const tenure = r.special_months ?? p?.tenureMonths ?? 12
    const end = addMonths(r.start_date, tenure)
    return {
      id: r.contract_no, investorId: invCode.get(r.investor_id) ?? '', companyId: r.company_id, productId: r.product_id, salesId: r.sales_person_id ?? '',
      currency: r.currency, amount: Number(r.amount), startDate: r.start_date, tenureMonths: tenure, endDate: end,
      monthlyProfitPct: n(r.special_profit_pct) ?? p?.monthlyProfitPct ?? 0,
      status: r.status === 'Closed early' ? 'Closed early' : r.status === 'Finished' || end < today ? 'Matured' : 'Active',
      renewalStatus: r.renewal_plan === 'Will renew' ? 'Renewing' : r.renewal_plan === 'Not decided' ? 'Undecided' : r.renewal_plan === 'Taking money back' ? 'Returning capital' : '—',
      contractPdfLink: r.contract_pdf_link,
    }
  })
  const coCountry = new Map(companies.map((c) => [c.id, c.country]))
  const ds: Dataset = {
    countries: COUNTRIES, companies, products, salesPeople, investors, contracts,
    payoutsPaid: raw.payouts_paid.filter((r) => r.payment_status === 'Paid and cleared').map((r) => ({
      id: r.id, contractId: ctCode.get(r.contract_id) ?? '', paidDate: r.payment_date, amount: Number(r.amount), currency: r.currency, reference: r.bank_reference ?? '',
    })),
    commissionsPaid: raw.commissions_paid.map((r) => ({
      id: r.id, salesId: r.sales_person_id, contractId: ctCode.get(r.contract_id) ?? '', paidDate: r.payment_date, amount: Number(r.amount), currency: r.currency, reference: r.reference ?? '',
    })),
    expenses: raw.expenses.map((r) => ({ id: r.id, date: r.date, companyId: r.company_id, country: CODE[r.country] ?? 'AE', category: r.expense_type, amount: Number(r.amount), currency: r.currency })),
    internalInvestments: raw.transfers.map((r) => ({
      id: r.id, date: r.date, fromCompanyId: r.from_company_id, toCompanyId: r.to_company_id, country: coCountry.get(r.to_company_id) ?? 'AE',
      amount: r.direction === 'Returned to group' ? -Number(r.amount) : Number(r.amount), currency: r.currency, purpose: r.purpose ?? '',
    })),
    leads: raw.leads.map((r): Lead => ({
      id: r.id, name: r.lead_name, createdDate: r.date_added, salesId: r.sales_person_id ?? '',
      stage: ({ 'New lead': 'Lead', 'Meeting done': 'Meeting', 'Proposal sent': 'Proposal', 'KYC in progress': 'KYC', Invested: 'Funded', Lost: 'Lost' } as const)[r.stage as 'Lost'] ?? 'Lead',
      expectedAmount: n(r.expected_amount), currency: r.currency ?? 'AED', productId: r.product_id ?? '',
      lastActivityDate: r.last_contact_date ?? r.date_added, nextAction: r.next_step ?? '—',
      source: r.lead_source === 'Event' ? 'Events' : (r.lead_source ?? 'Other'),
    })),
    fxRates: raw.fx_rates.map((r) => ({ currency: r.currency as Currency, month: String(r.month).slice(0, 7), rateToAED: Number(r.rate_to_aed) })),
    bankBalances: raw.bank_balances.map((r) => ({ account: `${r.bank_name} · ${r.account_name}`, currency: r.currency, balance: Number(r.balance), asOf: r.date })),
    syncLog: [],
  }
  const rows: [string, TableName, number][] = [
    ['Investors', 'investors', investors.length], ['Contracts', 'contracts', contracts.length], ['Payouts_Paid', 'payouts_paid', ds.payoutsPaid.length],
    ['Commission_Paid', 'commissions_paid', ds.commissionsPaid.length], ['Expenses', 'expenses', ds.expenses.length], ['Internal_Investments', 'transfers', ds.internalInvestments.length],
    ['CRM_Pipeline', 'leads', ds.leads.length], ['Bank_Balance', 'bank_balances', ds.bankBalances.length], ['FX_Rates', 'fx_rates', ds.fxRates.length],
  ]
  ds.syncLog = rows.map(([table, t, count]): SyncSource => ({ table, source: `GSY database › ${t}`, lastSync: loadedAt, rows: count, status: count ? 'OK' : 'Warning', note: count ? '' : 'No records entered yet' }))
  return ds
}

// ---------------------------------------------------------------- saving records

export async function saveRow(table: TableName, values: DbRow, id?: string) {
  const clean = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v === '' ? null : v]))
  const q = id ? supabase.from(table).update(clean).eq('id', id) : supabase.from(table).insert(clean)
  const { error } = await q
  if (error) throw new Error(friendly(error.message))
}

export async function deleteRow(table: TableName, id: string) {
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) throw new Error(friendly(error.message))
}

export async function saveSettings(values: Record<string, string>) {
  const rows = Object.entries(values).map(([key, value]) => ({ key, value: value === '' ? null : value }))
  const { error } = await supabase.from('settings').upsert(rows)
  if (error) throw new Error(friendly(error.message))
}

function friendly(msg: string) {
  if (/duplicate key/i.test(msg)) return 'This is already used by another record. Each one must be unique.'
  if (/violates foreign key/i.test(msg) && /delete|update/i.test(msg)) return 'Other records use this one. Remove or change those first.'
  if (/row-level security|permission denied/i.test(msg)) return 'You do not have permission to change this.'
  if (/check constraint/i.test(msg)) return 'One of the values is not allowed. Please check the form.'
  if (/null value/i.test(msg)) return 'A required field is empty.'
  return msg
}

// ---------------------------------------------------------------- people, roles, log

export async function loadProfile(userId: string): Promise<User | null> {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  return data ? toUser(data) : null
}

export function toUser(r: DbRow): User {
  return {
    id: r.id, name: r.full_name || r.email, email: r.email, role: r.is_chairman ? 'Chairman' : r.role,
    permissions: r.permissions ?? [], countries: r.countries ?? [], status: r.status, twoStep: false,
    createdBy: '', createdAt: String(r.created_at ?? '').slice(0, 10), lastSignIn: r.last_sign_in,
  }
}

export async function loadPeople(): Promise<{ users: User[]; roles: RoleDef[]; audit: AuditEntry[] }> {
  const [p, i, r, a] = await Promise.all([
    supabase.from('profiles').select('*').order('created_at'),
    supabase.from('invites').select('*').order('created_at'),
    supabase.from('roles').select('*').order('created_at'),
    supabase.from('audit_log').select('*').order('at', { ascending: false }).limit(200),
  ])
  const users = [
    ...(p.data ?? []).map(toUser),
    ...(i.data ?? []).map((x): User => ({
      id: `invite:${x.email}`, name: x.full_name || x.email, email: x.email, role: x.role, permissions: x.permissions ?? [], countries: x.countries ?? [],
      status: 'Invited', twoStep: false, createdBy: '', createdAt: String(x.created_at).slice(0, 10), lastSignIn: null,
    })),
  ]
  const roles = (r.data ?? []).map((x): RoleDef => ({ id: x.id, name: x.name, description: x.description, permissions: x.permissions as Permission[], countries: x.countries, createdBy: '', createdAt: String(x.created_at).slice(0, 10) }))
  const audit = (a.data ?? []).map((x): AuditEntry => ({ at: x.at, by: x.user_name ?? '—', action: x.table_name ? `${cap(x.action)} ${x.table_name.replace(/_/g, ' ')} record` : x.action }))
  return { users, roles, audit }
}
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

export async function logAction(userId: string, userName: string, action: string) {
  await supabase.from('audit_log').insert({ user_id: userId, user_name: userName, action })
}

export async function saveUser(u: User, existing: boolean) {
  if (!existing || u.id.startsWith('invite:')) {
    const { error } = await supabase.from('invites').upsert({ email: u.email.trim().toLowerCase(), full_name: u.name, role: u.role, permissions: u.permissions, countries: u.countries })
    if (error) throw new Error(friendly(error.message))
    return
  }
  const { error } = await supabase.from('profiles').update({ full_name: u.name, role: u.role, permissions: u.permissions, countries: u.countries, status: u.status === 'Disabled' ? 'Disabled' : 'Active' }).eq('id', u.id)
  if (error) throw new Error(friendly(error.message))
}

export async function removeUser(id: string) {
  const q = id.startsWith('invite:') ? supabase.from('invites').delete().eq('email', id.slice(7)) : supabase.from('profiles').delete().eq('id', id)
  const { error } = await q
  if (error) throw new Error(friendly(error.message))
}

export async function saveRole(r: RoleDef, previousName?: string) {
  const { error } = await supabase.from('roles').upsert({ id: r.id.length === 36 ? r.id : undefined, name: r.name, description: r.description, permissions: r.permissions, countries: r.countries })
  if (error) throw new Error(friendly(error.message))
  if (previousName) await supabase.from('profiles').update({ role: r.name, permissions: r.permissions }).eq('role', previousName).eq('is_chairman', false)
}

export async function deleteRole(id: string) {
  const { error } = await supabase.from('roles').delete().eq('id', id)
  if (error) throw new Error(friendly(error.message))
}

// ---------------------------------------------------------------- Excel → database

/** Saves an imported Excel into the database. Keyed tables are updated in place, so re-importing does not duplicate. */
export async function importToDatabase(r: ImportResult, onStep: (s: string) => void) {
  const ds = r.ds
  const sheets = r.sheets
  const up = async (table: TableName, rows: DbRow[], onConflict: string) => {
    if (!rows.length) return [] as DbRow[]
    const { data, error } = await supabase.from(table).upsert(rows, { onConflict }).select()
    if (error) throw new Error(`${table}: ${friendly(error.message)}`)
    return data ?? []
  }
  onStep('Setup')
  const cos = await up('companies', ds.companies.map((c) => ({ name: c.name, company_type: c.type === 'Sub-company' ? 'Sub-company' : 'Investment Company', country: COUNTRY_NAME[c.country], monthly_commission_pct: c.commissionPct })), 'name')
  const prods = await up('products', ds.products.map((p) => ({ name: p.name, months: p.tenureMonths, monthly_profit_pct: p.monthlyProfitPct, profit_paid: p.payoutFrequency === 'Quarterly' ? 'Every 3 months' : p.payoutFrequency === 'Maturity' ? 'At the end' : 'Every month', company_commission_pct: p.companyCommissionPct })), 'name')
  const sales = await up('sales_people', ds.salesPeople.map((s) => ({ name: s.name, staff_type: s.type === 'Freelancer' ? 'Freelancer' : 'Staff', country: COUNTRY_NAME[s.country], commission_pct: s.commissionPct, commission_paid: s.paymentMethod === 'Monthly' ? 'Every month' : 'One time' })), 'name')
  await up('fx_rates', ds.fxRates.map((f) => ({ month: `${f.month}-01`, currency: f.currency, rate_to_aed: f.rateToAED })), 'month,currency')
  const coId = new Map(cos.map((c) => [c.name, c.id]))
  const prId = new Map(prods.map((p) => [p.name, p.id]))
  const spId = new Map(sales.map((s) => [s.name, s.id]))

  onStep('Investors')
  const invExtra = new Map((sheets.investors ?? []).map((x) => [String(x.investorid ?? '').trim(), x]))
  const invs = await up('investors', ds.investors.map((i) => {
    const x = invExtra.get(i.id) ?? {}
    return {
      investor_code: i.id, investor_type: /company/i.test(String(x.investortype ?? '')) ? 'Company' : 'Person', full_name: i.fullName, country: COUNTRY_NAME[i.country],
      city: i.city || null, nationality: s(x.nationality), mobile: i.phone || null, email: i.email || null, date_of_birth: i.dateOfBirth,
      wedding_anniversary: d(x.weddinganniversary), passport_no: i.passportNo || null, passport_expiry: i.passportExpiry, emirates_id_expiry: i.emiratesIdExpiry,
      visa_expiry: d(x.visaexpiry), trade_licence_expiry: d(x.tradelicenceexpiry), kyc_status: i.kycStatus === 'Verified' ? 'Done' : i.kycStatus,
      sales_person_id: spId.get(i.assignedSalesId) ?? null, address: s(x.address), kyc_documents_link: i.documentFolderLink || null, notes: s(x.notes),
    }
  }), 'investor_code')
  const invId = new Map(invs.map((i) => [i.investor_code, i.id]))

  onStep('Investments')
  const ctExtra = new Map((sheets.contracts ?? []).map((x) => [String(x.contractno ?? '').trim(), x]))
  const cts = await up('contracts', ds.contracts.filter((c) => invId.has(c.investorId)).map((c) => {
    const x = ctExtra.get(c.id) ?? {}
    return {
      contract_no: c.id, investor_id: invId.get(c.investorId), company_id: coId.get(c.companyId) ?? cos[0]?.id, product_id: prId.get(c.productId), sales_person_id: spId.get(c.salesId) ?? null,
      currency: c.currency, amount: c.amount, start_date: c.startDate, special_months: num(x.specialmonths), special_profit_pct: pct(x.specialprofit), special_commission_pct: pct(x.specialcommission),
      payment_method: oneOf(x.paymentmethod, ['Bank transfer', 'Cheque', 'Cash', 'Other']), receipt_bank_reference: s(x.receiptbankreference),
      status: c.status === 'Closed early' ? 'Closed early' : c.status === 'Matured' ? 'Finished' : 'Active',
      renewal_plan: c.renewalStatus === 'Renewing' ? 'Will renew' : c.renewalStatus === 'Undecided' ? 'Not decided' : c.renewalStatus === 'Returning capital' ? 'Taking money back' : null,
      closed_early_date: d(x.closedearlydate), early_closure_penalty: num(x.earlyclosurepenalty), contract_pdf_link: c.contractPdfLink, notes: s(x.notes),
    }
  }), 'contract_no')
  const ctId = new Map(cts.map((c) => [c.contract_no, c.id]))

  onStep('Payments and other records')
  const payouts = ds.payoutsPaid.filter((p) => ctId.has(p.contractId))
  const withRef = payouts.filter((p) => p.reference && !/^\s*[A-Z]{2}\d{2}[A-Z0-9]{10,}/.test(p.reference))
  await up('payouts_paid', withRef.map((p) => ({ payment_date: p.paidDate, contract_id: ctId.get(p.contractId), amount: p.amount, currency: p.currency, bank_reference: p.reference.trim() })), 'bank_reference')
  const noRef = payouts.filter((p) => !withRef.includes(p))
  if (noRef.length) {
    const { error } = await supabase.from('payouts_paid').insert(noRef.map((p) => ({ payment_date: p.paidDate, contract_id: ctId.get(p.contractId), amount: p.amount, currency: p.currency })))
    if (error) throw new Error(`payouts_paid: ${friendly(error.message)}`)
  }
  await up('commissions_paid', ds.commissionsPaid.map((c) => ({ payment_date: c.paidDate, sales_person_id: spId.get(c.salesId), contract_id: ctId.get(c.contractId) ?? null, amount: c.amount, currency: c.currency, reference: c.reference || null, import_key: `${c.paidDate}|${c.salesId}|${c.contractId}|${c.amount}` })).filter((x) => x.sales_person_id), 'import_key')
  const expExtra = sheets.expenses ?? []
  await up('expenses', ds.expenses.map((e, k) => ({ date: e.date, company_id: coId.get(e.companyId) ?? cos[0]?.id, country: COUNTRY_NAME[e.country], expense_type: e.category, description: s(expExtra[k]?.description), amount: e.amount, currency: e.currency, notes: s(expExtra[k]?.notes), import_key: `${e.date}|${e.companyId}|${e.category}|${e.amount}|${s(expExtra[k]?.description) ?? ''}` })), 'import_key')
  await up('transfers', ds.internalInvestments.map((t) => ({ date: t.date, from_company_id: coId.get(t.fromCompanyId), to_company_id: coId.get(t.toCompanyId), direction: t.amount < 0 ? 'Returned to group' : 'Sent to sub-company', amount: Math.abs(t.amount), currency: t.currency, purpose: t.purpose || null, import_key: `${t.date}|${t.fromCompanyId}|${t.toCompanyId}|${t.amount}` })).filter((x) => x.from_company_id && x.to_company_id), 'import_key')
  const leadExtra = new Map((sheets.leads ?? []).map((x) => [String(x.leadname ?? '').trim(), x]))
  await up('leads', ds.leads.map((l) => {
    const x = leadExtra.get(l.name) ?? {}
    return {
      lead_name: l.name, mobile: s(x.mobile), sales_person_id: spId.get(l.salesId) ?? null, date_added: l.createdDate,
      stage: ({ Lead: 'New lead', Meeting: 'Meeting done', Proposal: 'Proposal sent', KYC: 'KYC in progress', Funded: 'Invested', Lost: 'Lost' } as const)[l.stage],
      expected_amount: l.expectedAmount, currency: l.currency, product_id: prId.get(l.productId) ?? null, lead_source: l.source === 'Events' ? 'Event' : l.source,
      last_contact_date: d(x.lastcontactdate), next_step: l.nextAction === '—' ? null : l.nextAction, next_step_date: d(x.nextstepdate), lost_reason: s(x.lostreason), notes: s(x.notes),
      import_key: `${l.name}|${l.createdDate}`,
    }
  }), 'import_key')
  await up('bank_balances', ds.bankBalances.map((b) => {
    const [bank, ...acct] = b.account.split(' · ')
    return { date: b.asOf, bank_name: bank || 'Bank', account_name: acct.join(' · ') || bank, currency: b.currency, balance: b.balance }
  }), 'date,bank_name,account_name')
  if (r.answers && Object.keys(r.answers).length) await saveSettings(r.answers)
  onStep('Done')
}

const s = (v: unknown) => (v === null || v === undefined || String(v).trim() === '' ? null : String(v).trim())
const num = (v: unknown) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v))
const pct = (v: unknown) => { const x = num(v); return x === null ? null : x > 1 ? x / 100 : x }
const oneOf = (v: unknown, list: string[]) => list.find((x) => x.toLowerCase() === String(v ?? '').trim().toLowerCase()) ?? null
function d(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000).toISOString().slice(0, 10)
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}
