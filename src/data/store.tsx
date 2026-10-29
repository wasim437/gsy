import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { monthKey, todayISO } from '../lib/dates'
import { buildCtx, type Ctx, type Filters, type ListFilterKey } from './engine'
import { generateSampleData } from './seed'
import type { CountryCode, Dataset } from './types'

// ---------------------------------------------------------------- users & permissions

export type Role = 'Chairman' | 'Vice Chairman' | 'Managing Director' | 'Country Head' | 'Accounts' | 'Administrator' | 'Viewer'
export const ROLES: Role[] = ['Chairman', 'Vice Chairman', 'Managing Director', 'Country Head', 'Accounts', 'Administrator', 'Viewer']

export type Permission =
  | 'viewDashboards' | 'viewInvestors' | 'viewCommissions' | 'downloadStatements' | 'useAI'
  | 'exportData' | 'uploadData' | 'reviewData' | 'manageUsers'

export const PERMISSIONS: { id: Permission; label: string; hint: string }[] = [
  { id: 'viewDashboards', label: 'View dashboards', hint: 'Home, cash, investments, payouts, analytics' },
  { id: 'viewInvestors', label: 'View investor details', hint: 'Names, contact, passport, statements' },
  { id: 'viewCommissions', label: 'View commissions & expenses', hint: 'Salaries, company & sales commission' },
  { id: 'downloadStatements', label: 'Download statements', hint: 'Investor PDF statements' },
  { id: 'useAI', label: 'Use AI assistant', hint: 'Ask questions in plain English' },
  { id: 'exportData', label: 'Export data', hint: 'Download CSV / Excel of all tables' },
  { id: 'uploadData', label: 'Upload & sync data', hint: 'Import Excel, run sync' },
  { id: 'reviewData', label: 'Review data issues', hint: 'Fix mismatches, duplicates' },
  { id: 'manageUsers', label: 'Manage users & access', hint: 'Create users, set roles and permissions' },
]

const ALL = PERMISSIONS.map((p) => p.id)
export const ROLE_DEFAULTS: Record<Role, Permission[]> = {
  Chairman: ALL,
  'Vice Chairman': ['viewDashboards', 'viewInvestors', 'viewCommissions', 'downloadStatements', 'useAI', 'exportData'],
  'Managing Director': ['viewDashboards', 'viewInvestors', 'viewCommissions', 'downloadStatements', 'useAI', 'exportData'],
  'Country Head': ['viewDashboards', 'viewInvestors', 'useAI'],
  Accounts: ['viewDashboards', 'viewInvestors', 'viewCommissions', 'downloadStatements', 'exportData', 'uploadData', 'reviewData'],
  Administrator: ['uploadData', 'reviewData', 'manageUsers'],
  Viewer: ['viewDashboards'],
}

export interface User {
  id: string
  name: string
  email: string
  role: Role
  permissions: Permission[]
  countries: CountryCode[] // empty = all countries
  status: 'Active' | 'Disabled'
  twoStep: boolean
  createdBy: string
  createdAt: string
  lastSignIn: string | null
}

export interface AuditEntry { at: string; by: string; action: string }

const SEED_USERS: User[] = [
  { id: 'U1', name: 'Chairman', email: 'chairman@gsy.example', role: 'Chairman', permissions: ROLE_DEFAULTS.Chairman, countries: [], status: 'Active', twoStep: true, createdBy: 'System', createdAt: '2026-10-28', lastSignIn: null },
  { id: 'U2', name: 'Vice Chairman', email: 'vice.chairman@gsy.example', role: 'Vice Chairman', permissions: ROLE_DEFAULTS['Vice Chairman'], countries: [], status: 'Active', twoStep: true, createdBy: 'Chairman', createdAt: '2026-10-28', lastSignIn: null },
  { id: 'U3', name: 'Managing Director', email: 'md@gsy.example', role: 'Managing Director', permissions: ROLE_DEFAULTS['Managing Director'], countries: [], status: 'Active', twoStep: true, createdBy: 'Chairman', createdAt: '2026-10-28', lastSignIn: null },
  { id: 'U4', name: 'India Head', email: 'india.head@gsy.example', role: 'Country Head', permissions: ROLE_DEFAULTS['Country Head'], countries: ['IN'], status: 'Active', twoStep: true, createdBy: 'Chairman', createdAt: '2026-10-29', lastSignIn: null },
  { id: 'U5', name: 'Accounts Team', email: 'accounts@gsy.example', role: 'Accounts', permissions: ROLE_DEFAULTS.Accounts, countries: [], status: 'Active', twoStep: true, createdBy: 'Chairman', createdAt: '2026-10-28', lastSignIn: null },
  { id: 'U6', name: 'System Admin', email: 'admin@gsy.example', role: 'Administrator', permissions: ROLE_DEFAULTS.Administrator, countries: [], status: 'Active', twoStep: true, createdBy: 'Chairman', createdAt: '2026-10-28', lastSignIn: null },
]

/** The Chairman always has every permission; nobody can take it away. */
export const can = (u: User | null | undefined, p: Permission) => !!u && (u.role === 'Chairman' || u.permissions.includes(p))

// ---------------------------------------------------------------- saved views

export interface SavedView { name: string; filters: Filters }

// ---------------------------------------------------------------- local persistence (preview only; Supabase in production)

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function save(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* storage blocked */ }
}
function loadSession(): string | null {
  // Development only: ?as=<userId> signs in directly (used for automated screenshots). Stripped from production builds.
  if (import.meta.env.DEV) {
    const as = new URLSearchParams(window.location.search).get('as')
    if (as) return as
  }
  try { return sessionStorage.getItem('gsy.session') } catch { return null }
}

// ---------------------------------------------------------------- store

interface Store {
  ds: Dataset
  today: string
  filters: Filters
  setFilters: (f: Partial<Filters>) => void
  toggleFilter: (k: ListFilterKey, v: string) => void
  resetFilters: () => void
  activeFilterCount: number
  views: SavedView[]
  saveView: (name: string) => void
  deleteView: (name: string) => void
  ctx: Ctx
  user: User | null
  users: User[]
  audit: AuditEntry[]
  signIn: (u: User) => void
  signOut: () => void
  upsertUser: (u: User) => void
  removeUser: (id: string) => void
}

const StoreCtx = createContext<Store | null>(null)

export function emptyFilters(month: string): Filters {
  return { companyIds: [], countries: [], productIds: [], currencies: [], salesIds: [], segments: [], states: [], view: 'AED', month }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const today = useMemo(() => todayISO(), [])
  const ds = useMemo(() => generateSampleData(today), [today])
  const [filters, setF] = useState<Filters>(() => emptyFilters(monthKey(today)))
  const [users, setUsers] = useState<User[]>(() => load('gsy.users', SEED_USERS))
  const [audit, setAudit] = useState<AuditEntry[]>(() => load('gsy.audit', []))
  const [views, setViews] = useState<SavedView[]>(() => load('gsy.views', []))
  const [sessionId, setSessionId] = useState<string | null>(loadSession)
  const user = users.find((u) => u.id === sessionId && u.status === 'Active') ?? null

  // Country heads only ever see their own countries, whatever the filter says.
  const effective = useMemo<Filters>(() => {
    if (!user || !user.countries.length) return filters
    const within = filters.countries.filter((c) => user.countries.includes(c as CountryCode))
    return { ...filters, countries: within.length ? within : user.countries }
  }, [filters, user])
  const ctx = useMemo(() => buildCtx(ds, effective, today), [ds, effective, today])

  const log = (action: string) => {
    const next = [{ at: new Date().toISOString(), by: user?.name ?? 'System', action }, ...audit].slice(0, 200)
    setAudit(next)
    save('gsy.audit', next)
  }
  const persistUsers = (next: User[]) => {
    setUsers(next)
    save('gsy.users', next)
  }

  const f = filters
  const activeFilterCount = f.companyIds.length + f.countries.length + f.productIds.length + f.currencies.length + f.salesIds.length + f.segments.length + f.states.length + (f.month !== monthKey(today) ? 1 : 0)

  const store: Store = {
    ds, today, filters: effective, ctx, user, users, audit, views, activeFilterCount,
    setFilters: (p) => setF((prev) => ({ ...prev, ...p })),
    toggleFilter: (k, v) =>
      setF((prev) => {
        const list = prev[k] as string[]
        return { ...prev, [k]: list.includes(v) ? list.filter((x) => x !== v) : [...list, v] }
      }),
    resetFilters: () => setF(emptyFilters(monthKey(today))),
    saveView: (name) => {
      const next = [...views.filter((v) => v.name !== name), { name, filters }]
      setViews(next)
      save('gsy.views', next)
    },
    deleteView: (name) => {
      const next = views.filter((v) => v.name !== name)
      setViews(next)
      save('gsy.views', next)
    },
    signIn: (u) => {
      setSessionId(u.id)
      try { sessionStorage.setItem('gsy.session', u.id) } catch { /* private mode */ }
      persistUsers(users.map((x) => (x.id === u.id ? { ...x, lastSignIn: new Date().toISOString() } : x)))
    },
    signOut: () => {
      setSessionId(null)
      try { sessionStorage.removeItem('gsy.session') } catch { /* private mode */ }
    },
    upsertUser: (u) => {
      const exists = users.some((x) => x.id === u.id)
      persistUsers(exists ? users.map((x) => (x.id === u.id ? u : x)) : [...users, u])
      log(exists ? `Updated ${u.name} (${u.role}${u.status === 'Disabled' ? ', disabled' : ''})` : `Created user ${u.name} as ${u.role}`)
    },
    removeUser: (id) => {
      const u = users.find((x) => x.id === id)
      if (!u || u.role === 'Chairman') return
      persistUsers(users.filter((x) => x.id !== id))
      log(`Removed user ${u.name}`)
    },
  }
  return <StoreCtx.Provider value={store}>{children}</StoreCtx.Provider>
}

export function useStore(): Store {
  const s = useContext(StoreCtx)
  if (!s) throw new Error('useStore outside StoreProvider')
  return s
}
