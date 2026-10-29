// Source tables. Each one maps 1:1 to a named Excel Table GSY will supply (see docs/REQUIREMENTS.md §3).

export type Currency = 'AED' | 'USD' | 'INR' | 'MYR' | 'SGD'
export const CURRENCIES: Currency[] = ['AED', 'USD', 'INR', 'MYR', 'SGD']

export type CountryCode = 'AE' | 'IN' | 'MY'

export interface Country {
  code: CountryCode
  name: string
  team: string
  localCurrency: Currency
}

export interface Company {
  id: string
  name: string
  type: 'Investment Co' | 'Sub-company'
  country: CountryCode
  commissionPct: number | null // monthly %, investment companies only
}

export type PayoutFrequency = 'Monthly' | 'Quarterly' | 'Maturity'

export interface Product {
  id: string
  name: string
  tenureMonths: number
  monthlyProfitPct: number
  payoutFrequency: PayoutFrequency
  companyCommissionPct: number | null // overrides company default when set
}

export interface SalesPerson {
  id: string
  name: string
  type: 'CRM Staff' | 'Freelancer'
  country: CountryCode
  commissionPct: number
  paymentMethod: 'One-time' | 'Monthly'
}

export interface Investor {
  id: string
  fullName: string
  country: CountryCode
  city: string
  phone: string
  email: string
  dateOfBirth: string | null
  passportNo: string
  passportExpiry: string | null
  emiratesIdExpiry: string | null
  kycStatus: 'Verified' | 'Pending' | 'Expired'
  documentFolderLink: string
  assignedSalesId: string
}

export type RenewalStatus = 'Renewing' | 'Undecided' | 'Returning capital' | '—'

export interface Contract {
  id: string
  investorId: string
  companyId: string
  productId: string
  salesId: string
  currency: Currency
  amount: number
  startDate: string
  tenureMonths: number
  endDate: string
  monthlyProfitPct: number
  status: 'Active' | 'Matured' | 'Closed early'
  renewalStatus: RenewalStatus
  contractPdfLink: string | null
}

export interface PayoutPaid {
  id: string
  contractId: string
  paidDate: string
  amount: number
  currency: Currency
  reference: string
}

export interface CommissionPaid {
  id: string
  salesId: string
  contractId: string
  paidDate: string
  amount: number
  currency: Currency
  reference: string
}

export type ExpenseCategory = 'Salary' | 'Rent' | 'Marketing' | 'Other'

export interface Expense {
  id: string
  date: string
  companyId: string
  country: CountryCode
  category: ExpenseCategory
  amount: number
  currency: Currency
}

export interface InternalInvestment {
  id: string
  date: string
  fromCompanyId: string
  toCompanyId: string
  country: CountryCode
  amount: number
  currency: Currency
  purpose: string
}

export type PipelineStage = 'Lead' | 'Meeting' | 'Proposal' | 'KYC' | 'Funded' | 'Lost'
export const OPEN_STAGES: PipelineStage[] = ['Lead', 'Meeting', 'Proposal', 'KYC']
export const FUNNEL_STAGES: PipelineStage[] = ['Lead', 'Meeting', 'Proposal', 'KYC', 'Funded']

export interface Lead {
  id: string
  name: string
  createdDate: string
  salesId: string
  stage: PipelineStage
  expectedAmount: number | null
  currency: Currency
  productId: string
  lastActivityDate: string
  nextAction: string
  source: 'Referral' | 'Social media' | 'Events' | 'Freelancer' | 'Website'
}

export interface FxRate {
  currency: Currency
  month: string // YYYY-MM
  rateToAED: number
}

export interface BankBalance {
  account: string
  currency: Currency
  balance: number
  asOf: string
}

export interface SyncSource {
  table: string
  source: string
  lastSync: string
  rows: number
  status: 'OK' | 'Warning' | 'Failed'
  note: string
}

export interface Dataset {
  countries: Country[]
  companies: Company[]
  products: Product[]
  salesPeople: SalesPerson[]
  investors: Investor[]
  contracts: Contract[]
  payoutsPaid: PayoutPaid[]
  commissionsPaid: CommissionPaid[]
  expenses: Expense[]
  internalInvestments: InternalInvestment[]
  leads: Lead[]
  fxRates: FxRate[]
  bankBalances: BankBalance[]
  syncLog: SyncSource[]
}

// Generated rows (never typed by anyone): built by the engine from Contracts.

export interface PayoutScheduleRow {
  key: string
  contractId: string
  monthNo: number
  dueDate: string
  profitDue: number
  capitalDue: number
  totalDue: number
  currency: Currency
  paid: number // allocated from PayoutPaid, FIFO by due date
  lastPaidDate: string | null
}

export interface CommissionScheduleRow {
  contractId: string
  type: 'Company' | 'CRM'
  salesId: string | null
  date: string
  amount: number
  currency: Currency
}

/** An amount kept both in its original currencies and converted to AED. */
export interface Money {
  aed: number
  byCur: Partial<Record<Currency, number>>
}
