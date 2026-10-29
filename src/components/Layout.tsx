import {
  Activity, Banknote, BadgePercent, Bell, Bookmark, Building2, Check, ChevronDown, Database, FileText, FlaskConical, Globe, Landmark,
  Layers, LayoutDashboard, LogOut, Mail, Menu, Network, Radar, RotateCcw, Scale, Search, ShieldCheck, SlidersHorizontal, Sparkles,
  Target, Trash2, Users, Wand2, X,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import type { ListFilterKey } from '../data/engine'
import { can, useStore, type Permission } from '../data/store'
import { CURRENCIES } from '../data/types'
import { addMonthKey, fmtDate, monthKey, monthLabel } from '../lib/dates'
import { SampleBanner } from './ui'

export interface NavItem { to: string; label: string; icon: ReactNode; short?: string; perm: Permission }

export const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'Overview', items: [
    { to: '/', label: 'Chairman Home', short: 'Home', icon: <LayoutDashboard size={18} />, perm: 'viewDashboards' },
    { to: '/cash', label: 'Cash Flow & Risk', icon: <Activity size={18} />, perm: 'viewDashboards' },
    { to: '/builder', label: 'Report Builder', icon: <Wand2 size={18} />, perm: 'viewDashboards' },
  ] },
  { group: 'Advanced Analytics', items: [
    { to: '/analytics/flow', label: 'Money Flow', icon: <Network size={18} />, perm: 'viewDashboards' },
    { to: '/analytics/stress', label: 'Stress Test & Calendar', icon: <FlaskConical size={18} />, perm: 'viewDashboards' },
    { to: '/analytics/portfolio', label: 'Portfolio Analytics', icon: <Layers size={18} />, perm: 'viewDashboards' },
    { to: '/analytics/sales', label: 'Sales Performance', icon: <Radar size={18} />, perm: 'viewDashboards' },
  ] },
  { group: 'Money', items: [
    { to: '/investments', label: 'Investments', icon: <Landmark size={18} />, perm: 'viewDashboards' },
    { to: '/payouts', label: 'Payouts & Cash Due', short: 'Payouts', icon: <Banknote size={18} />, perm: 'viewDashboards' },
    { to: '/contracts', label: 'Contracts: New & Expiring', icon: <FileText size={18} />, perm: 'viewDashboards' },
    { to: '/internal', label: 'Internal Investments', icon: <Building2 size={18} />, perm: 'viewDashboards' },
  ] },
  { group: 'People', items: [
    { to: '/investors', label: 'Investors', short: 'Investors', icon: <Users size={18} />, perm: 'viewInvestors' },
    { to: '/pipeline', label: 'CRM Pipeline', icon: <Target size={18} />, perm: 'viewDashboards' },
    { to: '/countries', label: 'Country Teams', icon: <Globe size={18} />, perm: 'viewDashboards' },
  ] },
  { group: 'Commission', items: [
    { to: '/commission', label: 'Company Commission & Expenses', icon: <Scale size={18} />, perm: 'viewCommissions' },
    { to: '/sales', label: 'CRM & Freelancer Commissions', icon: <BadgePercent size={18} />, perm: 'viewCommissions' },
  ] },
  { group: 'Tools', items: [
    { to: '/reminders', label: 'Reminders & Alerts', short: 'Alerts', icon: <Bell size={18} />, perm: 'viewDashboards' },
    { to: '/reports', label: 'Daily Email Reports', icon: <Mail size={18} />, perm: 'viewDashboards' },
    { to: '/assistant', label: 'AI Assistant', short: 'Ask AI', icon: <Sparkles size={18} />, perm: 'useAI' },
    { to: '/data', label: 'Data Sources & Checks', icon: <Database size={18} />, perm: 'reviewData' },
    { to: '/admin', label: 'Users & Access', icon: <ShieldCheck size={18} />, perm: 'manageUsers' },
  ] },
]
export const ALL_NAV = NAV.flatMap((g) => g.items)
const MOBILE_TABS = ['/', '/payouts', '/investors', '/reminders', '/assistant']

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/gsy-logo.webp" alt="GSY" className="h-11 w-11 shrink-0 rounded-xl bg-white/95 p-0.5" />
      <div className="leading-tight">
        <div className="text-[0.95rem] font-semibold tracking-wide text-white">GSY Group</div>
        <div className="text-[0.6875rem] text-gold-400">Investor Monitor</div>
      </div>
    </div>
  )
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useStore()
  return (
    <nav className="flex flex-col gap-5">
      {NAV.map((g) => {
        const items = g.items.filter((i) => can(user, i.perm))
        if (!items.length) return null
        return (
          <div key={g.group}>
            <div className="mb-1.5 px-3 text-[0.625rem] font-semibold tracking-[0.14em] text-white/35 uppercase">{g.group}</div>
            <div className="flex flex-col gap-0.5">
              {items.map((i) => (
                <NavLink
                  key={i.to}
                  to={i.to}
                  end={i.to === '/'}
                  onClick={onNavigate}
                  className={({ isActive }) => `flex items-center gap-2.5 rounded-xl px-3 py-2 text-[0.8125rem] transition ${isActive ? 'bg-gold-500/15 font-semibold text-gold-400' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}
                >
                  {i.icon}
                  <span className="truncate">{i.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        )
      })}
    </nav>
  )
}

// ---------------------------------------------------------------- slicers

function useOptions() {
  const { ds } = useStore()
  return {
    companyIds: ds.companies.filter((c) => c.type === 'Investment Co').map((c) => [c.id, c.name] as [string, string]),
    countries: ds.countries.map((c) => [c.code, c.name] as [string, string]),
    productIds: ds.products.map((p) => [p.id, p.name] as [string, string]),
    currencies: CURRENCIES.map((c) => [c, c] as [string, string]),
    salesIds: ds.salesPeople.map((s) => [s.id, `${s.name} (${s.type === 'Freelancer' ? 'FL' : 'Staff'})`] as [string, string]),
    segments: (['Platinum', 'Gold', 'Silver'] as const).map((s) => [s, s] as [string, string]),
    states: (['Active', 'Matured', 'Upcoming'] as const).map((s) => [s, s] as [string, string]),
  } satisfies Record<ListFilterKey, [string, string][]>
}

const LABELS: Record<ListFilterKey, string> = {
  companyIds: 'Company', countries: 'Country', productIds: 'Product', currencies: 'Currency', salesIds: 'Salesperson', segments: 'Segment', states: 'Contract status',
}

function MultiSelect({ k, compact }: { k: ListFilterKey; compact?: boolean }) {
  const { filters, toggleFilter, setFilters, user } = useStore()
  const opts = useOptions()[k]
  const sel = filters[k] as string[]
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const locked = k === 'countries' && !!user?.countries.length
  const options = locked ? opts.filter(([v]) => user!.countries.includes(v as never)) : opts
  const text = sel.length === 0 ? `All` : sel.length === 1 ? opts.find(([v]) => v === sel[0])?.[1] ?? sel[0] : `${sel.length} selected`
  return (
    <div ref={ref} className="relative flex min-w-0 flex-col gap-0.5">
      {!compact && <span className="text-[0.625rem] font-semibold tracking-wider text-muted uppercase">{LABELS[k]}</span>}
      <button onClick={() => setOpen((o) => !o)} className={`flex h-9 min-w-0 items-center justify-between gap-2 rounded-lg border px-2.5 text-left text-[0.8125rem] transition ${sel.length ? 'border-gold-500 bg-gold-50' : 'border-line bg-surface'} hover:border-gold-500`}>
        <span className="truncate">{compact && <span className="text-muted">{LABELS[k]}: </span>}{text}</span>
        <ChevronDown size={14} className="shrink-0 text-muted" />
      </button>
      {open && (
        <div className="absolute top-full left-0 z-40 mt-1 w-64 rounded-xl border border-line bg-white p-2 shadow-xl">
          {options.length > 6 && (
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="mb-1.5 h-8 w-full rounded-md border border-line px-2 text-xs outline-none focus:border-gold-500" />
          )}
          <div className="flex max-h-64 flex-col overflow-y-auto">
            {options.filter(([, l]) => l.toLowerCase().includes(q.toLowerCase())).map(([v, l]) => {
              const on = sel.includes(v)
              return (
                <button key={v} onClick={() => toggleFilter(k, v)} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-gold-50">
                  <span className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${on ? 'border-navy-900 bg-navy-900 text-white' : 'border-line'}`}>{on && <Check size={11} />}</span>
                  <span className="truncate">{l}</span>
                </button>
              )
            })}
          </div>
          <div className="mt-1.5 flex justify-between border-t border-line-2 pt-1.5 text-[0.6875rem]">
            <button onClick={() => setFilters({ [k]: options.map(([v]) => v) })} className="text-muted hover:text-ink">Select all</button>
            <button onClick={() => setFilters({ [k]: [] })} className="font-medium text-gold-600 hover:underline">Clear</button>
          </div>
        </div>
      )}
    </div>
  )
}

function MonthSelect() {
  const { filters, setFilters, today } = useStore()
  const months: [string, string][] = []
  for (let i = -24; i <= 6; i++) {
    const k = addMonthKey(monthKey(today), i)
    months.push([k, monthLabel(k, 'long') + (i === 0 ? ' (current)' : '')])
  }
  return (
    <label className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[0.625rem] font-semibold tracking-wider text-muted uppercase">Month</span>
      <select value={filters.month} onChange={(e) => setFilters({ month: e.target.value })} className={`h-9 min-w-0 rounded-lg border px-2.5 text-[0.8125rem] outline-none focus:border-gold-500 ${filters.month !== monthKey(today) ? 'border-gold-500 bg-gold-50' : 'border-line bg-surface'}`}>
        {months.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  )
}

function CurrencyToggle() {
  const { filters, setFilters } = useStore()
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[0.625rem] font-semibold tracking-wider text-muted uppercase">Show amounts in</span>
      <div className="flex h-9 rounded-lg border border-line bg-surface p-0.5">
        {(['AED', 'ORIGINAL'] as const).map((v) => (
          <button key={v} onClick={() => setFilters({ view: v })} className={`flex-1 rounded-md px-3 text-xs font-semibold transition ${filters.view === v ? 'bg-navy-900 text-white' : 'text-muted hover:text-ink'}`}>
            {v === 'AED' ? 'AED' : 'Original'}
          </button>
        ))}
      </div>
    </div>
  )
}

export function FilterBar({ onMore }: { onMore: () => void }) {
  const { resetFilters, activeFilterCount } = useStore()
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:flex lg:flex-wrap lg:items-end">
      <div className="lg:w-44"><MultiSelect k="companyIds" /></div>
      <div className="lg:w-36"><MultiSelect k="countries" /></div>
      <div className="lg:w-40"><MultiSelect k="productIds" /></div>
      <div className="lg:w-44"><MonthSelect /></div>
      <CurrencyToggle />
      <div className="col-span-2 flex items-end gap-2 sm:col-span-1">
        <button onClick={onMore} className="relative flex h-9 items-center gap-1.5 rounded-lg bg-navy-900 px-3 text-xs font-semibold text-white hover:bg-navy-800">
          <SlidersHorizontal size={14} /> All filters
          {activeFilterCount > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-gold-500 px-1 text-[0.625rem] font-bold text-navy-950">{activeFilterCount}</span>}
        </button>
        <button onClick={resetFilters} className="flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted hover:bg-gold-50 hover:text-ink" title="Clear all filters"><RotateCcw size={14} /></button>
      </div>
    </div>
  )
}

function FilterChips() {
  const { filters, toggleFilter, setFilters, today, user } = useStore()
  const opts = useOptions()
  const chips: { k: ListFilterKey | 'month'; v: string; label: string }[] = []
  for (const k of Object.keys(LABELS) as ListFilterKey[]) {
    for (const v of filters[k] as string[]) {
      if (k === 'countries' && user?.countries.length) continue
      chips.push({ k, v, label: `${LABELS[k]}: ${opts[k].find(([x]) => x === v)?.[1] ?? v}` })
    }
  }
  if (filters.month !== monthKey(today)) chips.push({ k: 'month', v: filters.month, label: `Month: ${monthLabel(filters.month, 'long')}` })
  if (!chips.length && !user?.countries.length) return null
  return (
    <div className="flex flex-wrap gap-1.5 px-4 pb-2.5 sm:px-6">
      {user?.countries.length ? <span className="inline-flex items-center gap-1 rounded-full bg-navy-900 px-2.5 py-1 text-[0.6875rem] font-semibold text-white"><ShieldCheck size={12} /> Access limited to {user.countries.join(', ')}</span> : null}
      {chips.map((c) => (
        <button key={c.k + c.v} onClick={() => (c.k === 'month' ? setFilters({ month: monthKey(today) }) : toggleFilter(c.k, c.v))} className="inline-flex items-center gap-1 rounded-full border border-gold-500/40 bg-gold-50 px-2.5 py-1 text-[0.6875rem] font-medium text-ink hover:border-gold-500">
          {c.label} <X size={12} className="text-muted" />
        </button>
      ))}
    </div>
  )
}

function FilterPane({ onClose }: { onClose: () => void }) {
  const { views, saveView, deleteView, setFilters, resetFilters, activeFilterCount } = useStore()
  const [name, setName] = useState('')
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-navy-950/40" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex w-[380px] max-w-[92vw] flex-col bg-page shadow-2xl">
        <div className="flex items-center justify-between border-b border-line bg-white px-5 py-4">
          <div>
            <div className="font-semibold">Filters</div>
            <div className="text-xs text-muted">{activeFilterCount ? `${activeFilterCount} active · applies to every page` : 'Applies to every page'}</div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gold-50" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="scroll-thin flex-1 space-y-4 overflow-y-auto p-5">
          <MonthSelect />
          <CurrencyToggle />
          {(Object.keys(LABELS) as ListFilterKey[]).map((k) => <MultiSelect key={k} k={k} />)}

          <div className="rounded-xl border border-line bg-white p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold"><Bookmark size={14} className="text-gold-600" /> Saved views</div>
            <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) { saveView(name.trim()); setName('') } }} className="flex gap-1.5">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. India · Board meeting" className="h-8 flex-1 rounded-md border border-line px-2 text-xs outline-none focus:border-gold-500" />
              <button type="submit" className="rounded-md bg-navy-900 px-2.5 text-xs font-semibold text-white">Save</button>
            </form>
            <div className="mt-2 flex flex-col gap-1">
              {views.map((v) => (
                <div key={v.name} className="flex items-center justify-between rounded-md bg-page px-2 py-1.5 text-xs">
                  <button onClick={() => { setFilters(v.filters); onClose() }} className="flex-1 truncate text-left font-medium hover:text-gold-600">{v.name}</button>
                  <button onClick={() => deleteView(v.name)} className="p-0.5 text-muted hover:text-bad" aria-label="Delete view"><Trash2 size={13} /></button>
                </div>
              ))}
              {!views.length && <div className="text-[0.6875rem] text-muted">Save the current filters to reopen them in one click.</div>}
            </div>
          </div>
        </div>
        <div className="flex gap-2 border-t border-line bg-white p-4">
          <button onClick={resetFilters} className="flex-1 rounded-xl border border-line py-2 text-sm font-medium hover:bg-gold-50">Clear all</button>
          <button onClick={onClose} className="flex-1 rounded-xl bg-navy-900 py-2 text-sm font-semibold text-white">Show results</button>
        </div>
      </aside>
    </div>
  )
}

// ---------------------------------------------------------------- Ctrl+K search

function CommandPalette({ onClose }: { onClose: () => void }) {
  const { ds, user } = useStore()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const s = q.toLowerCase()
  const pages = ALL_NAV.filter((n) => can(user, n.perm) && n.label.toLowerCase().includes(s)).map((n) => ({ key: n.to, label: n.label, sub: 'Page', to: n.to }))
  const investors = can(user, 'viewInvestors') && s.length > 1
    ? ds.investors.filter((x) => `${x.fullName} ${x.id} ${x.city}`.toLowerCase().includes(s)).slice(0, 8).map((x) => ({ key: x.id, label: x.fullName, sub: `Investor · ${x.id} · ${x.city}`, to: `/investors/${x.id}` }))
    : []
  const contracts = s.length > 2 ? ds.contracts.filter((c) => c.id.toLowerCase().includes(s)).slice(0, 5).map((c) => ({ key: c.id, label: c.id, sub: `Contract · ${c.currency} ${c.amount.toLocaleString()}`, to: `/investors/${c.investorId}` })) : []
  const results = [...pages, ...investors, ...contracts]
  const go = (to: string) => { nav(to); onClose() }
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-navy-950/40 px-4 pt-[12vh]" onClick={onClose}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search size={17} className="text-muted" />
          <input
            autoFocus value={q} onChange={(e) => { setQ(e.target.value); setI(0) }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(results.length - 1, x + 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)) }
              if (e.key === 'Enter' && results[i]) go(results[i].to)
              if (e.key === 'Escape') onClose()
            }}
            placeholder="Search pages, investors, contracts…" className="h-14 flex-1 text-sm outline-none"
          />
          <kbd className="rounded border border-line px-1.5 text-[0.625rem] text-muted">ESC</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {results.map((r, j) => (
            <button key={r.key + j} onMouseEnter={() => setI(j)} onClick={() => go(r.to)} className={`flex w-full flex-col rounded-lg px-3 py-2 text-left ${j === i ? 'bg-gold-50' : ''}`}>
              <span className="text-sm font-medium">{r.label}</span>
              <span className="text-[0.6875rem] text-muted">{r.sub}</span>
            </button>
          ))}
          {!results.length && <div className="px-3 py-6 text-center text-sm text-muted">No results</div>}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- layout

export default function Layout() {
  const { user, signOut, ds, today } = useStore()
  const [drawer, setDrawer] = useState(false)
  const [pane, setPane] = useState(false)
  const [palette, setPalette] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const loc = useLocation()
  const lastSync = ds.syncLog.map((s) => s.lastSync).sort().pop()!

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true) } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-navy-900 px-3 py-5 lg:flex">
        <div className="px-3 pb-6"><Brand /></div>
        <div className="scroll-thin flex-1 overflow-y-auto pr-1"><SideNav /></div>
        <UserBox onSignOut={signOut} name={user?.name ?? ''} role={user?.role ?? ''} />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/60" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-navy-900 px-3 py-5">
            <div className="flex items-center justify-between px-3 pb-6">
              <Brand />
              <button onClick={() => setDrawer(false)} className="rounded-lg p-1.5 text-white/70 hover:bg-white/10" aria-label="Close menu"><X size={20} /></button>
            </div>
            <div className="scroll-thin flex-1 overflow-y-auto"><SideNav onNavigate={() => setDrawer(false)} /></div>
            <UserBox onSignOut={signOut} name={user?.name ?? ''} role={user?.role ?? ''} />
          </aside>
        </div>
      )}
      {pane && <FilterPane onClose={() => setPane(false)} />}
      {palette && <CommandPalette onClose={() => setPalette(false)} />}

      <header className="no-print sticky top-0 z-20 border-b border-line bg-page/90 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
          <button onClick={() => setDrawer(true)} className="rounded-lg p-1.5 text-ink hover:bg-gold-50 lg:hidden" aria-label="Open menu"><Menu size={20} /></button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-good-bg px-2.5 py-0.5 text-[0.6875rem] font-semibold text-good">
                <span className="h-1.5 w-1.5 rounded-full bg-good" /> Synced {lastSync.slice(11, 16)} · {fmtDate(today, false)}
              </span>
              <SampleBanner />
            </div>
          </div>
          <button onClick={() => setPalette(true)} className="hidden h-8 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-xs text-muted hover:border-gold-500 sm:flex">
            <Search size={14} /> Search <kbd className="rounded border border-line px-1 text-[0.625rem]">Ctrl K</kbd>
          </button>
          <button onClick={() => setPalette(true)} className="rounded-lg p-1.5 sm:hidden" aria-label="Search"><Search size={18} /></button>
          <button onClick={() => setShowFilters((s) => !s)} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink lg:hidden">
            <SlidersHorizontal size={14} /> Filters
          </button>
        </div>
        <div className={`${showFilters ? 'block' : 'hidden'} border-t border-line px-4 pb-3 pt-2.5 sm:px-6 lg:block lg:border-0 lg:pt-0`}>
          <FilterBar onMore={() => setPane(true)} />
        </div>
        <FilterChips />
      </header>

      <main key={loc.pathname} className="page-enter mx-auto max-w-[1500px] px-4 pt-5 pb-28 sm:px-6 lg:pb-10">
        <Outlet />
      </main>

      <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-white/10 bg-navy-900 pb-[env(safe-area-inset-bottom)] lg:hidden">
        {MOBILE_TABS.map((to) => {
          const i = ALL_NAV.find((x) => x.to === to)!
          return (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[0.625rem] font-medium ${isActive ? 'text-gold-400' : 'text-white/60'}`}>
              {i.icon}
              {i.short ?? i.label}
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}

function UserBox({ name, role, onSignOut }: { name: string; role: string; onSignOut: () => void }) {
  return (
    <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-white/5 px-3 py-2.5">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gold-500 text-xs font-bold text-navy-950">{name.split(' ').map((w) => w[0]).join('').slice(0, 2)}</div>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-xs font-semibold text-white">{name}</div>
        <div className="truncate text-[0.6875rem] text-white/50">{role}</div>
      </div>
      <button onClick={onSignOut} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white" title="Sign out" aria-label="Sign out"><LogOut size={16} /></button>
    </div>
  )
}
