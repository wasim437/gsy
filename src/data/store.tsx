import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { monthKey, todayISO } from '../lib/dates'
import { buildCtx, type Ctx, type Filters, type ListFilterKey } from './engine'
import { generateSampleData } from './seed'
import type { CountryCode, Dataset } from './types'

// ---------------------------------------------------------------- users & permissions

/** Role names are free text: the Chairman creates them (e.g. "Sub Vice Chairman"). */
export type Role = string
export const CHAIRMAN: Role = 'Chairman'

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
export const ALL_PERMISSIONS = PERMISSIONS.map((p) => p.id)

/** A role is a named set of permissions the Chairman defines. Users get the role's permissions. */
export interface RoleDef {
  id: string
  name: Role
  description: string
  permissions: Permission[]
  countries: CountryCode[] // default country limit for people given this role; empty = all
  createdBy: string
  createdAt: string
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

// The system starts with only the Chairman. Everyone else, and every other role, is created by him.
const SEED_USERS: User[] = [
  { id: 'U1', name: 'Chairman', email: 'chairman@gsy.example', role: CHAIRMAN, permissions: ALL_PERMISSIONS, countries: [], status: 'Active', twoStep: true, createdBy: 'System', createdAt: '2026-10-28', lastSignIn: null },
]

/** The Chairman always has every permission; nobody can take it away. */
export const can = (u: User | null | undefined, p: Permission) => !!u && (u.role === CHAIRMAN || u.permissions.includes(p))

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
  roles: RoleDef[]
  audit: AuditEntry[]
  signIn: (u: User) => void
  signOut: () => void
  upsertUser: (u: User) => void
  removeUser: (id: string) => void
  upsertRole: (r: RoleDef) => void
  removeRole: (id: string) => string | null
}

const StoreCtx = createContext<Store | null>(null)

export function emptyFilters(month: string): Filters {
  return { companyIds: [], countries: [], productIds: [], currencies: [], salesIds: [], segments: [], states: [], view: 'AED', month }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const today = useMemo(() => todayISO(), [])
  const ds = useMemo(() => generateSampleData(today), [today])
  const [filters, setF] = useState<Filters>(() => emptyFilters(monthKey(today)))
  const [users, setUsers] = useState<User[]>(() => load('gsy.users.v2', SEED_USERS))
  const [roles, setRoles] = useState<RoleDef[]>(() => load('gsy.roles.v1', []))
  const [audit, setAudit] = useState<AuditEntry[]>(() => load('gsy.audit.v2', []))
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
    save('gsy.audit.v2', next)
  }
  const persistUsers = (next: User[]) => {
    setUsers(next)
    save('gsy.users.v2', next)
  }
  const persistRoles = (next: RoleDef[]) => {
    setRoles(next)
    save('gsy.roles.v1', next)
  }

  const f = filters
  const activeFilterCount = f.companyIds.length + f.countries.length + f.productIds.length + f.currencies.length + f.salesIds.length + f.segments.length + f.states.length + (f.month !== monthKey(today) ? 1 : 0)

  const store: Store = {
    ds, today, filters: effective, ctx, user, users, roles, audit, views, activeFilterCount,
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
      if (!u || u.role === CHAIRMAN) return
      persistUsers(users.filter((x) => x.id !== id))
      log(`Removed user ${u.name}`)
    },
    upsertRole: (r) => {
      const prev = roles.find((x) => x.id === r.id)
      persistRoles(prev ? roles.map((x) => (x.id === r.id ? r : x)) : [...roles, r])
      // Everyone holding the role follows its permissions (and its name if renamed).
      if (prev) persistUsers(users.map((u) => (u.role === prev.name ? { ...u, role: r.name, permissions: r.permissions } : u)))
      log(prev ? `Updated role ${r.name} (${r.permissions.length} permissions)` : `Created role ${r.name} (${r.permissions.length} permissions)`)
    },
    removeRole: (id) => {
      const r = roles.find((x) => x.id === id)
      if (!r) return null
      const holders = users.filter((u) => u.role === r.name)
      if (holders.length) return `${holders.length} user(s) still have the role ${r.name}. Move them to another role first.`
      persistRoles(roles.filter((x) => x.id !== id))
      log(`Deleted role ${r.name}`)
      return null
    },
  }
  return <StoreCtx.Provider value={store}>{children}</StoreCtx.Provider>
}

export function useStore(): Store {
  const s = useContext(StoreCtx)
  if (!s) throw new Error('useStore outside StoreProvider')
  return s
}
