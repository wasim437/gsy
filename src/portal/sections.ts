// Admin Portal forms: one section per sheet of the GSY data-entry Excel, same names and choices.
// Each field maps to a column of the Supabase table created by supabase/migrations/001_gsy_schema.sql.

import type { DbRow, RawTables, TableName } from '../data/db'

export type FieldType = 'text' | 'textarea' | 'number' | 'money' | 'pct' | 'date' | 'month' | 'select' | 'ref' | 'bool'

export interface Field {
  key: string
  label: string
  type: FieldType
  required?: boolean
  options?: string[]
  /** For type 'ref': which list to pick from. */
  ref?: RefName
  hint?: string
  wide?: boolean
  default?: string | boolean
}

export type RefName = 'companies' | 'investmentCompanies' | 'products' | 'sales' | 'investors' | 'contracts'

export interface Section {
  id: string
  group: 'Setup' | 'Records'
  title: string
  table: TableName
  description: string
  fields: Field[]
  /** Columns shown in the list. */
  list: string[]
  sortBy: string
  sortDesc?: boolean
  /** Suggest a new code, e.g. the next INV-0001. */
  nextCode?: { field: string; prefix: string; digits: number }
  /** Fill other fields when one changes (e.g. currency from the chosen contract). */
  derive?: (changed: string, values: Record<string, string | boolean>, raw: RawTables) => Record<string, string>
}

const COUNTRIES = ['UAE', 'India', 'Malaysia']
const CURRENCIES = ['AED', 'USD', 'INR', 'MYR', 'SGD']

const fromContract = (changed: string, v: Record<string, string | boolean>, raw: RawTables) => {
  if (changed !== 'contract_id' || !v.contract_id) return {}
  const c = raw.contracts.find((x) => x.id === v.contract_id)
  if (!c) return {}
  const out: Record<string, string> = { currency: c.currency }
  if ('payment_for' in v && !v.amount) {
    const p = raw.products.find((x) => x.id === c.product_id)
    const pct = Number(c.special_profit_pct ?? p?.monthly_profit_pct ?? 0)
    if (pct) out.amount = String(Math.round(Number(c.amount) * pct * 100) / 100)
  }
  return out
}

export const SECTIONS: Section[] = [
  // ---------------------------------------------------------------- Setup
  {
    id: 'companies', group: 'Setup', title: 'Companies', table: 'companies', sortBy: 'name',
    description: 'The 2 investment companies and every sub-company.',
    list: ['name', 'company_type', 'country', 'monthly_commission_pct'],
    fields: [
      { key: 'name', label: 'Company Name', type: 'text', required: true, hint: 'Full name' },
      { key: 'company_type', label: 'Company Type', type: 'select', required: true, options: ['Investment Company', 'Sub-company'], default: 'Investment Company', hint: 'Investment Company signs contracts with investors; Sub-company receives group money' },
      { key: 'country', label: 'Country', type: 'select', required: true, options: COUNTRIES, default: 'UAE' },
      { key: 'monthly_commission_pct', label: 'Monthly Commission %', type: 'pct', hint: 'e.g. 0.50 (investment companies only)' },
      { key: 'trade_licence_expiry', label: 'Trade Licence Expiry', type: 'date', hint: 'Reminder 30 days before' },
    ],
  },
  {
    id: 'products', group: 'Setup', title: 'Products', table: 'products', sortBy: 'name',
    description: 'The investment plans GSY sells.',
    list: ['name', 'months', 'monthly_profit_pct', 'profit_paid', 'company_commission_pct'],
    fields: [
      { key: 'name', label: 'Product Name', type: 'text', required: true, hint: 'e.g. Fixed 24 Months' },
      { key: 'months', label: 'Months', type: 'number', required: true, hint: 'How long the money stays invested' },
      { key: 'monthly_profit_pct', label: 'Monthly Profit %', type: 'pct', required: true, hint: 'e.g. 1.75' },
      { key: 'profit_paid', label: 'Profit Paid', type: 'select', required: true, options: ['Every month', 'Every 3 months', 'At the end'], default: 'Every month' },
      { key: 'company_commission_pct', label: 'Company Commission %', type: 'pct', hint: 'Only if different from the company’s usual %' },
    ],
  },
  {
    id: 'sales', group: 'Setup', title: 'Sales Team', table: 'sales_people', sortBy: 'name',
    description: 'Every CRM staff member and freelancer who brings investors.',
    list: ['name', 'staff_type', 'country', 'commission_pct', 'commission_paid', 'active'],
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'staff_type', label: 'Staff or Freelancer', type: 'select', required: true, options: ['Staff', 'Freelancer'], default: 'Staff' },
      { key: 'country', label: 'Country', type: 'select', required: true, options: COUNTRIES, default: 'UAE' },
      { key: 'commission_pct', label: 'Commission %', type: 'pct', required: true, hint: 'e.g. 3.00' },
      { key: 'commission_paid', label: 'Commission Paid', type: 'select', required: true, options: ['One time', 'Every month'], default: 'One time', hint: 'One time = when the investor pays; Every month = spread over the contract' },
      { key: 'email', label: 'Email', type: 'text' },
      { key: 'mobile', label: 'Mobile', type: 'text', hint: 'With country code' },
      { key: 'active', label: 'Active', type: 'bool', default: true },
    ],
  },
  {
    id: 'commission-by-product', group: 'Setup', title: 'Commission by Product', table: 'commission_by_product', sortBy: 'created_at',
    description: 'Optional: only if a different commission % applies to a product (for everyone, or for one salesperson).',
    list: ['product_id', 'sales_person_id', 'commission_pct', 'commission_paid'],
    fields: [
      { key: 'product_id', label: 'Product', type: 'ref', ref: 'products', required: true },
      { key: 'sales_person_id', label: 'Salesperson', type: 'ref', ref: 'sales', hint: 'Leave empty = everyone' },
      { key: 'commission_pct', label: 'Commission %', type: 'pct', required: true },
      { key: 'commission_paid', label: 'Commission Paid', type: 'select', options: ['One time', 'Every month'], hint: 'Leave empty to keep the person’s usual method' },
    ],
  },
  {
    id: 'fx', group: 'Setup', title: 'Exchange Rates', table: 'fx_rates', sortBy: 'month', sortDesc: true,
    description: 'Rate to change other currencies into AED, one per currency per month.',
    list: ['month', 'currency', 'rate_to_aed'],
    fields: [
      { key: 'month', label: 'Month', type: 'month', required: true },
      { key: 'currency', label: 'Currency', type: 'select', required: true, options: ['USD', 'INR', 'MYR', 'SGD'], default: 'USD' },
      { key: 'rate_to_aed', label: '1 Unit in AED', type: 'number', required: true, hint: 'e.g. 3.6725 for USD' },
    ],
  },
  {
    id: 'targets', group: 'Setup', title: 'Sales Targets', table: 'sales_targets', sortBy: 'month', sortDesc: true,
    description: 'Monthly target for new investment, per country (and per salesperson if you set them).',
    list: ['month', 'country', 'sales_person_id', 'target_aed'],
    fields: [
      { key: 'month', label: 'Month', type: 'month', required: true },
      { key: 'country', label: 'Country', type: 'select', required: true, options: COUNTRIES, default: 'UAE' },
      { key: 'sales_person_id', label: 'Salesperson', type: 'ref', ref: 'sales', hint: 'Empty = whole country' },
      { key: 'target_aed', label: 'Target Amount (AED)', type: 'money', required: true },
    ],
  },
  // ---------------------------------------------------------------- Records
  {
    id: 'investors', group: 'Records', title: 'Investors', table: 'investors', sortBy: 'investor_code',
    description: 'One record per investor. The Investor ID never changes.',
    nextCode: { field: 'investor_code', prefix: 'INV-', digits: 4 },
    list: ['investor_code', 'full_name', 'country', 'mobile', 'kyc_status', 'sales_person_id'],
    fields: [
      { key: 'investor_code', label: 'Investor ID', type: 'text', required: true, hint: 'e.g. INV-0001' },
      { key: 'investor_type', label: 'Investor Type', type: 'select', required: true, options: ['Person', 'Company'], default: 'Person' },
      { key: 'full_name', label: 'Full Name', type: 'text', required: true, hint: 'As on passport', wide: true },
      { key: 'country', label: 'Country', type: 'select', required: true, options: COUNTRIES, default: 'UAE' },
      { key: 'city', label: 'City', type: 'text' },
      { key: 'nationality', label: 'Nationality', type: 'text' },
      { key: 'mobile', label: 'Mobile', type: 'text', hint: 'With country code' },
      { key: 'email', label: 'Email', type: 'text' },
      { key: 'date_of_birth', label: 'Date of Birth', type: 'date', hint: 'Birthday reminder 2 days before' },
      { key: 'wedding_anniversary', label: 'Wedding Anniversary', type: 'date' },
      { key: 'passport_no', label: 'Passport / EID No', type: 'text' },
      { key: 'passport_expiry', label: 'Passport Expiry', type: 'date' },
      { key: 'emirates_id_expiry', label: 'Emirates ID Expiry', type: 'date' },
      { key: 'visa_expiry', label: 'Visa Expiry', type: 'date' },
      { key: 'trade_licence_expiry', label: 'Trade Licence Expiry', type: 'date', hint: 'Company investors' },
      { key: 'kyc_status', label: 'KYC Status', type: 'select', required: true, options: ['Done', 'Pending', 'Expired'], default: 'Pending' },
      { key: 'sales_person_id', label: 'Salesperson', type: 'ref', ref: 'sales', required: true },
      { key: 'referred_by_investor_id', label: 'Referred By (Investor ID)', type: 'ref', ref: 'investors' },
      { key: 'address', label: 'Address', type: 'textarea', hint: 'For sending gifts', wide: true },
      { key: 'kyc_documents_link', label: 'KYC Documents Link', type: 'text', wide: true },
      { key: 'notes', label: 'Notes', type: 'textarea', wide: true },
    ],
  },
  {
    id: 'investments', group: 'Records', title: 'Investments', table: 'contracts', sortBy: 'start_date', sortDesc: true,
    description: 'One record per investment contract. Payouts, end dates and commissions are worked out from it.',
    nextCode: { field: 'contract_no', prefix: 'CT-', digits: 4 },
    list: ['contract_no', 'investor_id', 'product_id', 'amount', 'currency', 'start_date', 'status'],
    fields: [
      { key: 'contract_no', label: 'Contract No', type: 'text', required: true, hint: 'e.g. CT-0001' },
      { key: 'investor_id', label: 'Investor ID', type: 'ref', ref: 'investors', required: true },
      { key: 'company_id', label: 'Company', type: 'ref', ref: 'investmentCompanies', required: true },
      { key: 'product_id', label: 'Product', type: 'ref', ref: 'products', required: true, hint: 'Months and profit % come from the product' },
      { key: 'sales_person_id', label: 'Salesperson', type: 'ref', ref: 'sales', required: true },
      { key: 'currency', label: 'Currency', type: 'select', required: true, options: CURRENCIES, default: 'AED' },
      { key: 'amount', label: 'Amount', type: 'money', required: true },
      { key: 'start_date', label: 'Start Date', type: 'date', required: true },
      { key: 'special_months', label: 'Special Months', type: 'number', hint: 'Only if different from the product' },
      { key: 'special_profit_pct', label: 'Special Profit %', type: 'pct', hint: 'Only if different from the product' },
      { key: 'special_commission_pct', label: 'Special Commission %', type: 'pct', hint: 'Only if this deal is different' },
      { key: 'payment_method', label: 'Payment Method', type: 'select', required: true, options: ['Bank transfer', 'Cheque', 'Cash', 'Other'], default: 'Bank transfer' },
      { key: 'receipt_bank_reference', label: 'Receipt Bank Reference', type: 'text', hint: 'Bank reference of the money received' },
      { key: 'status', label: 'Status', type: 'select', required: true, options: ['Active', 'Finished', 'Closed early'], default: 'Active' },
      { key: 'renewal_plan', label: 'Renewal Plan', type: 'select', options: ['Will renew', 'Not decided', 'Taking money back'], hint: 'For contracts ending soon' },
      { key: 'closed_early_date', label: 'Closed Early Date', type: 'date' },
      { key: 'early_closure_penalty', label: 'Early Closure Penalty', type: 'money' },
      { key: 'contract_pdf_link', label: 'Contract PDF Link', type: 'text', wide: true },
      { key: 'notes', label: 'Notes', type: 'textarea', wide: true },
    ],
  },
  {
    id: 'payouts', group: 'Records', title: 'Payouts Paid', table: 'payouts_paid', sortBy: 'payment_date', sortDesc: true,
    description: 'Every payment GSY makes to an investor (monthly profit, or capital at the end).',
    list: ['payment_date', 'contract_id', 'amount', 'currency', 'payment_for', 'payment_status', 'bank_reference'],
    derive: fromContract,
    fields: [
      { key: 'payment_date', label: 'Payment Date', type: 'date', required: true },
      { key: 'contract_id', label: 'Contract No', type: 'ref', ref: 'contracts', required: true, hint: 'Currency and monthly profit fill in automatically' },
      { key: 'amount', label: 'Amount Paid', type: 'money', required: true },
      { key: 'currency', label: 'Currency', type: 'select', required: true, options: CURRENCIES, default: 'AED' },
      { key: 'payment_for', label: 'Payment For', type: 'select', required: true, options: ['Monthly profit', 'Capital return', 'Profit and capital'], default: 'Monthly profit' },
      { key: 'payment_status', label: 'Payment Status', type: 'select', required: true, options: ['Paid and cleared', 'Sent but not cleared', 'Returned or failed'], default: 'Paid and cleared', hint: 'Only “Paid and cleared” counts as paid' },
      { key: 'bank_reference', label: 'Bank Reference', type: 'text', required: true, hint: 'The bank’s transaction reference (not the IBAN)' },
      { key: 'paid_from_account', label: 'Paid From Account', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'textarea', wide: true },
    ],
  },
  {
    id: 'commissions', group: 'Records', title: 'Commission Paid', table: 'commissions_paid', sortBy: 'payment_date', sortDesc: true,
    description: 'Every commission payment made to a salesperson.',
    list: ['payment_date', 'sales_person_id', 'contract_id', 'amount', 'currency', 'reference'],
    derive: fromContract,
    fields: [
      { key: 'payment_date', label: 'Payment Date', type: 'date', required: true },
      { key: 'sales_person_id', label: 'Salesperson', type: 'ref', ref: 'sales', required: true },
      { key: 'contract_id', label: 'Contract No', type: 'ref', ref: 'contracts', required: true },
      { key: 'amount', label: 'Amount', type: 'money', required: true },
      { key: 'currency', label: 'Currency', type: 'select', required: true, options: CURRENCIES, default: 'AED' },
      { key: 'reference', label: 'Reference', type: 'text', hint: 'Bank / voucher no.' },
      { key: 'notes', label: 'Notes', type: 'textarea', wide: true },
    ],
  },
  {
    id: 'expenses', group: 'Records', title: 'Expenses', table: 'expenses', sortBy: 'date', sortDesc: true,
    description: 'Salaries, rent, marketing and other costs. (Sales commission is entered in Commission Paid.)',
    list: ['date', 'company_id', 'country', 'expense_type', 'description', 'amount', 'currency'],
    fields: [
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'company_id', label: 'Company', type: 'ref', ref: 'investmentCompanies', required: true },
      { key: 'country', label: 'Country', type: 'select', required: true, options: COUNTRIES, default: 'UAE' },
      { key: 'expense_type', label: 'Expense Type', type: 'select', required: true, options: ['Salary', 'Rent', 'Marketing', 'Other'], default: 'Other' },
      { key: 'description', label: 'Description', type: 'text', wide: true },
      { key: 'amount', label: 'Amount', type: 'money', required: true },
      { key: 'currency', label: 'Currency', type: 'select', required: true, options: CURRENCIES, default: 'AED' },
      { key: 'notes', label: 'Notes', type: 'textarea', wide: true },
    ],
  },
  {
    id: 'transfers', group: 'Records', title: 'Sub-company Transfers', table: 'transfers', sortBy: 'date', sortDesc: true,
    description: 'Group money sent to sub-companies, and money they send back.',
    list: ['date', 'from_company_id', 'to_company_id', 'direction', 'amount', 'currency'],
    fields: [
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'from_company_id', label: 'From Company', type: 'ref', ref: 'companies', required: true },
      { key: 'to_company_id', label: 'To Company', type: 'ref', ref: 'companies', required: true },
      { key: 'direction', label: 'Money Sent or Returned', type: 'select', required: true, options: ['Sent to sub-company', 'Returned to group'], default: 'Sent to sub-company' },
      { key: 'amount', label: 'Amount', type: 'money', required: true },
      { key: 'currency', label: 'Currency', type: 'select', required: true, options: CURRENCIES, default: 'AED' },
      { key: 'purpose', label: 'Purpose', type: 'text' },
      { key: 'bank_reference', label: 'Bank Reference', type: 'text' },
    ],
  },
  {
    id: 'leads', group: 'Records', title: 'Sales Leads', table: 'leads', sortBy: 'date_added', sortDesc: true,
    description: 'People who may invest but have not invested yet.',
    list: ['lead_name', 'sales_person_id', 'stage', 'expected_amount', 'last_contact_date', 'next_step'],
    fields: [
      { key: 'lead_name', label: 'Lead Name', type: 'text', required: true },
      { key: 'mobile', label: 'Mobile', type: 'text' },
      { key: 'sales_person_id', label: 'Salesperson', type: 'ref', ref: 'sales', required: true },
      { key: 'date_added', label: 'Date Added', type: 'date', required: true },
      { key: 'stage', label: 'Stage', type: 'select', required: true, options: ['New lead', 'Meeting done', 'Proposal sent', 'KYC in progress', 'Invested', 'Lost'], default: 'New lead' },
      { key: 'expected_amount', label: 'Expected Amount', type: 'money' },
      { key: 'currency', label: 'Currency', type: 'select', options: CURRENCIES, default: 'AED' },
      { key: 'product_id', label: 'Product', type: 'ref', ref: 'products' },
      { key: 'lead_source', label: 'Lead Source', type: 'select', options: ['Referral', 'Social media', 'Event', 'Freelancer', 'Website', 'Other'] },
      { key: 'last_contact_date', label: 'Last Contact Date', type: 'date', required: true, hint: 'Leads with no contact for 7 days are flagged' },
      { key: 'next_step', label: 'Next Step', type: 'text' },
      { key: 'next_step_date', label: 'Next Step Date', type: 'date' },
      { key: 'lost_reason', label: 'Lost Reason', type: 'text', hint: 'Only if Lost' },
      { key: 'notes', label: 'Notes', type: 'textarea', wide: true },
    ],
  },
  {
    id: 'bank', group: 'Records', title: 'Bank Balance', table: 'bank_balances', sortBy: 'date', sortDesc: true,
    description: 'Closing balance of each GSY bank account (for cash cover).',
    list: ['date', 'bank_name', 'account_name', 'currency', 'balance'],
    fields: [
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'bank_name', label: 'Bank Name', type: 'text', required: true },
      { key: 'account_name', label: 'Account Name', type: 'text', required: true, hint: 'Do not type the full account number' },
      { key: 'currency', label: 'Currency', type: 'select', required: true, options: CURRENCIES, default: 'AED' },
      { key: 'balance', label: 'Balance', type: 'number', required: true },
      { key: 'notes', label: 'Notes', type: 'textarea', wide: true },
    ],
  },
  {
    id: 'gifts', group: 'Records', title: 'Gifts Sent', table: 'gifts', sortBy: 'date', sortDesc: true,
    description: 'Optional: gifts sent to investors.',
    list: ['date', 'investor_id', 'occasion', 'gift', 'cost_aed', 'sent_by'],
    fields: [
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'investor_id', label: 'Investor ID', type: 'ref', ref: 'investors', required: true },
      { key: 'occasion', label: 'Occasion', type: 'select', required: true, options: ['Birthday', 'Wedding anniversary', 'Contract anniversary', 'Festival', 'Other'], default: 'Birthday' },
      { key: 'gift', label: 'Gift', type: 'text' },
      { key: 'cost_aed', label: 'Cost (AED)', type: 'money' },
      { key: 'sent_by', label: 'Sent By', type: 'ref', ref: 'sales' },
      { key: 'notes', label: 'Notes', type: 'textarea', wide: true },
    ],
  },
]

/** Options for a reference dropdown: [id, label]. */
export function refOptions(ref: RefName, raw: RawTables): [string, string][] {
  const byName = (rows: DbRow[]) => [...rows].sort((a, b) => String(a.name).localeCompare(String(b.name))).map((r): [string, string] => [r.id, r.name])
  switch (ref) {
    case 'companies': return byName(raw.companies)
    case 'investmentCompanies': return byName(raw.companies.filter((c) => c.company_type === 'Investment Company'))
    case 'products': return byName(raw.products)
    case 'sales': return byName(raw.sales_people)
    case 'investors': return [...raw.investors].sort((a, b) => String(a.investor_code).localeCompare(String(b.investor_code), undefined, { numeric: true })).map((r) => [r.id, `${r.investor_code} · ${r.full_name}`])
    case 'contracts': {
      const inv = new Map(raw.investors.map((i) => [i.id, i.full_name]))
      return [...raw.contracts].sort((a, b) => String(a.contract_no).localeCompare(String(b.contract_no), undefined, { numeric: true })).map((r) => [r.id, `${r.contract_no} · ${inv.get(r.investor_id) ?? ''}`])
    }
  }
}
