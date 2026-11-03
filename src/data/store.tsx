import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { monthKey, todayISO } from '../lib/dates'
import { dbEnabled, supabase } from '../lib/supabase'
import * as dbApi from './db'
import { TABLES, type RawTables } from './db'
import { buildCtx, type Ctx, type Filters, type ListFilterKey } from './engine'
import type { ImportResult } from './importExcel'
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
  { id: 'uploadData', label: 'Enter & edit data', hint: 'Data Entry forms and Excel import' },
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
  status: 'Active' | 'Disabled' | 'Pending' | 'Invited'
  twoStep: boolean
  createdBy: string
  createdAt: string
  lastSignIn: string | null
}

export interface AuditEntry { at: string; by: string; action: string }

// Demo mode starts with only the Chairman. Everyone else, and every other role, is created by him.
const SEED_USERS: User[] = [
  { id: 'U1', name: 'Chairman', email: 'chairman@gsy.example', role: CHAIRMAN, permissions: ALL_PERMISSIONS, countries: [], status: 'Active', twoStep: true, createdBy: 'System', createdAt: '2026-10-28', lastSignIn: null },
]

/** The Chairman always has every permission; nobody can take it away. (The database enforces the same rules.) */
export const can = (u: User | null | undefined, p: Permission) => !!u && (u.role === CHAIRMAN || u.permissions.includes(p))

// ---------------------------------------------------------------- saved views

export interface SavedView { name: string; filters: Filters }

// ---------------------------------------------------------------- browser storage (views; demo-mode data)

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
  /** Demo mode only: an Excel loaded in this browser, or null. */
  imported: ImportResult | null
  applyImport: (r: ImportResult) => void
  clearImport: () => void
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
  // ---- connected to GSY's database
  dbMode: boolean
  authReady: boolean
  pendingApproval: boolean
  sessionEmail: string | null
  raw: RawTables | null
  dataLoading: boolean
  loadError: string
  refresh: () => Promise<void>
  notice: { kind: 'ok' | 'error'; text: string } | null
  notify: (kind: 'ok' | 'error', text: string) => void
}

const StoreCtx = createContext<Store | null>(null)

export function emptyFilters(month: string): Filters {
  return { companyIds: [], countries: [], productIds: [], currencies: [], salesIds: [], segments: [], states: [], view: 'AED', month }
}

const EMPTY_RAW = Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as RawTables
const EMPTY_DS: Dataset = dbApi.toDataset(EMPTY_RAW, new Date().toISOString())

export function StoreProvider({ children }: { children: ReactNode }) {
  const today = useMemo(() => todayISO(), [])
  const sample = useMemo(() => (dbEnabled ? EMPTY_DS : generateSampleData(today)), [today])
  const [imported, setImported] = useState<ImportResult | null>(() => (dbEnabled ? null : load<ImportResult | null>('gsy.import.v1', null)))
  const [filters, setF] = useState<Filters>(() => emptyFilters(monthKey(today)))
  const [localUsers, setLocalUsers] = useState<User[]>(() => load('gsy.users.v2', SEED_USERS))
  const [localRoles, setLocalRoles] = useState<RoleDef[]>(() => load('gsy.roles.v1', []))
  const [localAudit, setLocalAudit] = useState<AuditEntry[]>(() => load('gsy.audit.v2', []))
  const [views, setViews] = useState<SavedView[]>(() => load('gsy.views', []))
  const [sessionId, setSessionId] = useState<string | null>(loadSession)
  const [notice, setNotice] = useState<Store['notice']>(null)
  const notify = useCallback((kind: 'ok' | 'error', text: string) => {
    setNotice({ kind, text })
    setTimeout(() => setNotice((cur) => (cur?.text === text ? null : cur)), kind === 'error' ? 7000 : 3500)
  }, [])

  // ---- database mode
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(!dbEnabled)
  const [profile, setProfile] = useState<User | null>(null)
  const [db, setDb] = useState<{ raw: RawTables; ds: Dataset } | null>(null)
  const [dataLoading, setDataLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [people, setPeople] = useState<{ users: User[]; roles: RoleDef[]; audit: AuditEntry[] }>({ users: [], roles: [], audit: [] })

  useEffect(() => {
    if (!dbEnabled) return
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const refreshPeople = useCallback(async (me: User | null) => {
    if (!dbEnabled || !me || !can(me, 'manageUsers')) return
    try { setPeople(await dbApi.loadPeople()) } catch (e) { notify('error', (e as Error).message) }
  }, [notify])

  const refresh = useCallback(async () => {
    if (!dbEnabled) return
    setDataLoading(true)
    try {
      const r = await dbApi.loadAll()
      setDb({ raw: r.raw, ds: r.ds })
      setLoadError('')
    } catch (e) {
      setLoadError((e as Error).message)
    } finally {
      setDataLoading(false)
    }
  }, [])

  const uid = session?.user.id
  useEffect(() => {
    if (!dbEnabled) return
    if (!uid) { setProfile(null); setDb(null); return }
    let cancelled = false
    ;(async () => {
      const p = await dbApi.loadProfile(uid)
      if (cancelled) return
      setProfile(p)
      if (p?.status === 'Active') {
        void supabase.from('profiles').update({ last_sign_in: new Date().toISOString() }).eq('id', uid)
        await Promise.all([refresh(), refreshPeople(p)])
      }
    })()
    return () => { cancelled = true }
  }, [uid, refresh, refreshPeople])

  const localUser = localUsers.find((u) => u.id === sessionId && u.status === 'Active') ?? null
  const user = dbEnabled ? (profile?.status === 'Active' ? profile : null) : localUser
  const users = dbEnabled ? people.users : localUsers
  const roles = dbEnabled ? people.roles : localRoles
  const audit = dbEnabled ? people.audit : localAudit
  const ds = dbEnabled ? db?.ds ?? EMPTY_DS : imported?.ds ?? sample

  // Country heads only ever see their own countries, whatever the filter says.
  const effective = useMemo<Filters>(() => {
    if (!user || !user.countries.length) return filters
    const within = filters.countries.filter((c) => user.countries.includes(c as CountryCode))
    return { ...filters, countries: within.length ? within : user.countries }
  }, [filters, user])
  const ctx = useMemo(() => buildCtx(ds, effective, today), [ds, effective, today])

  const log = (action: string) => {
    if (dbEnabled) {
      if (user) void dbApi.logAction(user.id, user.name, action)
      return
    }
    const next = [{ at: new Date().toISOString(), by: user?.name ?? 'System', action }, ...localAudit].slice(0, 200)
    setLocalAudit(next)
    save('gsy.audit.v2', next)
  }
  const persistUsers = (next: User[]) => { setLocalUsers(next); save('gsy.users.v2', next) }
  const persistRoles = (next: RoleDef[]) => { setLocalRoles(next); save('gsy.roles.v1', next) }
  /** Run a database change, report the result, then reload people and roles. */
  const run = (work: Promise<unknown>, ok: string) =>
    work.then(() => { notify('ok', ok); return refreshPeople(user) }).catch((e) => notify('error', (e as Error).message))

  const f = filters
  const activeFilterCount = f.companyIds.length + f.countries.length + f.productIds.length + f.currencies.length + f.salesIds.length + f.segments.length + f.states.length + (f.month !== monthKey(today) ? 1 : 0)

  const store: Store = {
    ds, today, filters: effective, ctx, user, users, roles, audit, views, activeFilterCount, imported, notice, notify,
    dbMode: dbEnabled, authReady, pendingApproval: dbEnabled && !!session && !!profile && profile.status !== 'Active',
    sessionEmail: session?.user.email ?? null, raw: dbEnabled ? db?.raw ?? null : null, dataLoading, loadError, refresh,
    applyImport: (r) => {
      setImported(r)
      save('gsy.import.v1', r)
      setF(emptyFilters(monthKey(today)))
      log(`Imported ${r.fileName} (${r.counts.Investors} investors, ${r.counts.Investments} investments)`)
    },
    clearImport: () => {
      setImported(null)
      try { localStorage.removeItem('gsy.import.v1') } catch { /* storage blocked */ }
      setF(emptyFilters(monthKey(today)))
    },
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
      persistUsers(localUsers.map((x) => (x.id === u.id ? { ...x, lastSignIn: new Date().toISOString() } : x)))
    },
    signOut: () => {
      if (dbEnabled) { void supabase.auth.signOut(); return }
      setSessionId(null)
      try { sessionStorage.removeItem('gsy.session') } catch { /* private mode */ }
    },
    upsertUser: (u) => {
      const exists = users.some((x) => x.id === u.id)
      if (dbEnabled) {
        void run(dbApi.saveUser(u, exists), exists ? `Saved ${u.name}` : `${u.email} invited. They sign up with this email to get access.`)
        log(exists ? `Updated ${u.name} (${u.role}, ${u.status})` : `Invited ${u.email} as ${u.role}`)
        return
      }
      persistUsers(exists ? localUsers.map((x) => (x.id === u.id ? u : x)) : [...localUsers, u])
      log(exists ? `Updated ${u.name} (${u.role}${u.status === 'Disabled' ? ', disabled' : ''})` : `Created user ${u.name} as ${u.role}`)
    },
    removeUser: (id) => {
      const u = users.find((x) => x.id === id)
      if (!u || u.role === CHAIRMAN) return
      if (dbEnabled) {
        void run(dbApi.removeUser(id), `${u.name} removed`)
      } else {
        persistUsers(localUsers.filter((x) => x.id !== id))
      }
      log(`Removed user ${u.name}`)
    },
    upsertRole: (r) => {
      const prev = roles.find((x) => x.id === r.id)
      if (dbEnabled) {
        void run(dbApi.saveRole(r, prev?.name), `Role ${r.name} saved`)
      } else {
        persistRoles(prev ? localRoles.map((x) => (x.id === r.id ? r : x)) : [...localRoles, r])
        // Everyone holding the role follows its permissions (and its name if renamed).
        if (prev) persistUsers(localUsers.map((u) => (u.role === prev.name ? { ...u, role: r.name, permissions: r.permissions } : u)))
      }
      log(prev ? `Updated role ${r.name} (${r.permissions.length} permissions)` : `Created role ${r.name} (${r.permissions.length} permissions)`)
    },
    removeRole: (id) => {
      const r = roles.find((x) => x.id === id)
      if (!r) return null
      const holders = users.filter((u) => u.role === r.name)
      if (holders.length) return `${holders.length} user(s) still have the role ${r.name}. Move them to another role first.`
      if (dbEnabled) void run(dbApi.deleteRole(id), `Role ${r.name} deleted`)
      else persistRoles(localRoles.filter((x) => x.id !== id))
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
