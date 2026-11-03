import {
  ArrowUpRight, ClipboardList, Database, History as HistoryIcon, LayoutList, Loader2, LogOut, Pencil, Plus,
  RefreshCw, Search, ShieldCheck, Table2, Trash2, X,
} from 'lucide-react'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { NavLink, Navigate, useNavigate, useParams } from 'react-router-dom'
import Toast from '../components/Toast'
import { ThemeToggle } from '../components/ui'
import { APP_VERSION } from '../data/changelog'
import { QUESTIONS, qkey } from '../data/companyInfo'
import * as db from '../data/db'
import type { DbRow, RawTables } from '../data/db'
import { can, useStore } from '../data/store'
import { dashboardHref, portalPath } from '../lib/site'
import Admin from '../pages/Admin'
import { defaults, display, fromForm, nextCode, toForm, validate, type Values } from './fields'
import History from './History'
import { SECTIONS, refOptions, type Field, type Section } from './sections'
import Sheet from './Sheet'

const EMPTY = Object.fromEntries(db.TABLES.map((t) => [t, []])) as unknown as RawTables

export default function Portal() {
  const { section = 'investors' } = useParams()
  const { user, raw, dbMode, refresh, dataLoading, loadError, signOut } = useStore()
  const navigate = useNavigate()
  const data = raw ?? EMPTY
  const groups: { name: string; items: { id: string; title: string; count?: number; icon?: ReactNode }[] }[] = [
    { name: 'Start', items: [
      { id: 'company-info', title: 'Company Info', count: data.settings.filter((s) => s.value).length, icon: <ClipboardList size={15} /> },
      ...(can(user, 'manageUsers') ? [{ id: 'users', title: 'Users & Access', icon: <ShieldCheck size={15} /> }] : []),
    ] },
    { name: 'Setup', items: SECTIONS.filter((s) => s.group === 'Setup').map((s) => ({ id: s.id, title: s.title, count: data[s.table].length })) },
    { name: 'Records', items: SECTIONS.filter((s) => s.group === 'Records').map((s) => ({ id: s.id, title: s.title, count: data[s.table].length })) },
    { name: 'Tools', items: [{ id: 'history', title: 'Activity Log', icon: <HistoryIcon size={15} /> }] },
  ]
  const current = SECTIONS.find((s) => s.id === section)
  if (!current && !['company-info', 'users', 'history'].includes(section)) return <Navigate to={portalPath('investors')} replace />

  return (
    <div className="min-h-screen bg-page lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex items-center gap-2.5 border-b border-line px-5 py-4">
          <img src="/gsy-logo.webp" alt="GSY" className="h-10 w-10" />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-sm font-semibold text-navy-900">GSY Admin Portal</div>
            <div className="text-[0.6875rem] text-muted">Data entry · v{APP_VERSION}</div>
          </div>
          <ThemeToggle />
        </div>
        <nav className="scroll-thin flex-1 overflow-y-auto px-3 py-4">
          {groups.map((g) => (
            <div key={g.name} className="mb-4">
              <div className="mb-1 px-2 text-[0.625rem] font-semibold tracking-[0.14em] text-muted uppercase">{g.name}</div>
              {g.items.map((i) => (
                <NavLink key={i.id} to={portalPath(i.id)} className={({ isActive }) => `flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-[0.8125rem] ${isActive ? 'bg-navy-900 font-semibold text-white' : 'text-ink-2 hover:bg-gold-50'}`}>
                  <span className="flex min-w-0 items-center gap-2"><span className="shrink-0 opacity-70">{i.icon ?? <Database size={15} />}</span><span className="truncate">{i.title}</span></span>
                  {i.count !== undefined && <span className="num rounded-full bg-black/5 px-1.5 text-[0.6875rem]">{i.count}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <a href={dashboardHref} className="mb-2 flex items-center justify-center gap-1.5 rounded-xl bg-gold-500 px-3 py-2 text-sm font-semibold text-navy-950 hover:bg-gold-400">Open dashboard <ArrowUpRight size={15} /></a>
          <div className="flex items-center justify-between gap-2 px-1 text-xs">
            <span className="truncate text-muted">{user?.name} · {user?.role}</span>
            <button onClick={signOut} className="rounded p-1 text-muted hover:text-ink" title="Sign out" aria-label="Sign out"><LogOut size={14} /></button>
          </div>
        </div>
      </aside>

      {/* Phone: section picker */}
      <div className="sticky top-0 z-20 border-b border-line bg-surface px-4 py-2.5 lg:hidden">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-semibold text-navy-900"><img src="/gsy-logo.webp" alt="" className="h-7 w-7" /> GSY Admin Portal</span>
          <span className="flex items-center gap-1">
            <ThemeToggle />
            <a href={dashboardHref} className="px-1 text-xs font-semibold text-gold-600">Dashboard ↗</a>
            <button onClick={signOut} className="rounded p-1.5 text-muted hover:text-ink" title="Sign out" aria-label="Sign out"><LogOut size={15} /></button>
          </span>
        </div>
        <select value={section} onChange={(e) => navigate(portalPath(e.target.value))} className="input h-10">
          {groups.flatMap((g) => g.items.map((i) => <option key={i.id} value={i.id}>{g.name} · {i.title}{i.count !== undefined ? ` (${i.count})` : ''}</option>))}
        </select>
      </div>

      <main className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">
        {!dbMode && <Banner tone="warn">This app is not connected to GSY’s database, so entries cannot be saved. Add the Supabase settings in .env.local.</Banner>}
        {loadError && <Banner tone="bad">Could not load the database: {loadError}. If the tables are missing, run the setup SQL in Supabase first.</Banner>}
        {section === 'company-info' ? <CompanyInfo raw={data} /> : section === 'users' ? <Admin /> : section === 'history' ? <History raw={data} /> : (
          <SectionView key={current!.id} s={current!} raw={data} loading={dataLoading} onRefresh={refresh} />
        )}
      </main>

      <Toast />
    </div>
  )
}

function Banner({ tone, children }: { tone: 'warn' | 'bad'; children: ReactNode }) {
  return <div className={`mb-4 rounded-xl px-4 py-3 text-sm ${tone === 'bad' ? 'bg-bad-bg text-bad' : 'bg-warn-bg text-warn'}`}>{children}</div>
}

// ---------------------------------------------------------------- list + form for one section

function SectionView({ s, raw, loading, onRefresh }: { s: Section; raw: RawTables; loading: boolean; onRefresh: () => Promise<void> }) {
  const { user, notify } = useStore()
  const canEdit = can(user, 'uploadData')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<DbRow | 'new' | null>(null)
  const [view, setView] = useState<'sheet' | 'list'>(() => {
    try { const v = localStorage.getItem('gsy.portal.view'); if (v === 'sheet' || v === 'list') return v } catch { /* storage blocked */ }
    return window.innerWidth >= 1024 ? 'sheet' : 'list'
  })
  const pickView = (v: 'sheet' | 'list') => { setView(v); try { localStorage.setItem('gsy.portal.view', v) } catch { /* storage blocked */ } }
  const rows = raw[s.table]
  const fieldsByKey = new Map(s.fields.map((f) => [f.key, f]))
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    const list = term ? rows.filter((r) => s.fields.some((f) => display(f, r[f.key], raw).toLowerCase().includes(term))) : rows
    return [...list].sort((a, b) => {
      const x = String(a[s.sortBy] ?? ''), y = String(b[s.sortBy] ?? '')
      return (s.sortDesc ? -1 : 1) * x.localeCompare(y, undefined, { numeric: true })
    })
  }, [rows, q, s, raw])

  const remove = async (r: DbRow) => {
    const label = display(s.fields[0], r[s.fields[0].key], raw)
    if (!confirm(`Delete “${label}” from ${s.title}? This cannot be undone.`)) return
    try {
      await db.deleteRow(s.table, r.id)
      notify('ok', `Deleted ${label}`)
      await onRefresh()
    } catch (e) {
      notify('error', (e as Error).message)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6875rem] font-semibold tracking-wider text-gold-600 uppercase">{s.group}</div>
          <h1 className="text-2xl font-semibold text-navy-900">{s.title}</h1>
          <p className="mt-0.5 text-sm text-muted">{s.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-xl border border-line bg-surface p-1" role="tablist" aria-label="View">
            <button onClick={() => pickView('sheet')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-sm font-semibold ${view === 'sheet' ? 'bg-navy-900 text-white' : 'text-muted hover:text-ink'}`} title="Type into rows like Excel"><Table2 size={15} /> Sheet</button>
            <button onClick={() => pickView('list')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-sm font-semibold ${view === 'list' ? 'bg-navy-900 text-white' : 'text-muted hover:text-ink'}`} title="List with a form for each record"><LayoutList size={15} /> List</button>
          </div>
          <button onClick={() => void onRefresh()} className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-sm hover:bg-gold-50" title="Reload"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
          {canEdit && <button onClick={() => setEditing('new')} className="inline-flex items-center gap-1.5 rounded-xl bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800"><Plus size={16} /> Add {s.title.replace(/^\d\s/, '').replace(/s$/, '')}</button>}
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-surface">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Search size={16} className="text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${s.title.replace(/^\d\s/, '').toLowerCase()}…`} className="w-full bg-transparent text-sm outline-none" />
          <span className="num shrink-0 text-xs text-muted">{shown.length} of {rows.length}</span>
        </div>
        {view === 'sheet' ? (
          <Sheet s={s} raw={raw} rows={shown} canEdit={canEdit} onSaved={onRefresh} />
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
            <Database size={28} className="text-muted" />
            <div className="text-sm text-muted">Nothing entered yet.</div>
            {canEdit && <button onClick={() => setEditing('new')} className="inline-flex items-center gap-1.5 rounded-xl bg-gold-500 px-4 py-2 text-sm font-semibold text-navy-950"><Plus size={15} /> Add the first one</button>}
          </div>
        ) : (
          <div className="scroll-thin max-h-[calc(100vh-260px)] overflow-auto">
            <table className="tbl">
              <thead><tr>{s.list.map((k) => <th key={k} className={['money', 'number', 'pct'].includes(fieldsByKey.get(k)?.type ?? '') ? 'r' : ''}>{fieldsByKey.get(k)?.label}</th>)}{canEdit && <th className="r">Actions</th>}</tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="cursor-pointer" onClick={() => canEdit && setEditing(r)}>
                    {s.list.map((k) => {
                      const f = fieldsByKey.get(k)!
                      return <td key={k} className={`${['money', 'number', 'pct'].includes(f.type) ? 'r' : ''} ${k === s.list[0] ? 'font-medium' : ''}`}>{display(f, r[k], raw)}</td>
                    })}
                    {canEdit && (
                      <td className="r" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex gap-1">
                          <button onClick={() => setEditing(r)} className="rounded-lg border border-line p-1.5 text-ink-2 hover:bg-gold-50" title="Edit" aria-label="Edit"><Pencil size={14} /></button>
                          <button onClick={() => void remove(r)} className="rounded-lg border border-line p-1.5 text-bad hover:bg-bad-bg" title="Delete" aria-label="Delete"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editing && <RecordForm s={s} raw={raw} row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={onRefresh} />}
    </div>
  )
}

function RecordForm({ s, raw, row, onClose, onSaved }: { s: Section; raw: RawTables; row: DbRow | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const { notify } = useStore()
  const [values, setValues] = useState<Values>(() => {
    const v: Values = {}
    Object.assign(v, row ? Object.fromEntries(s.fields.map((f) => [f.key, toForm(f, row[f.key])])) : defaults(s))
    if (!row && s.nextCode) v[s.nextCode.field] = nextCode(raw[s.table].map((r) => String(r[s.nextCode!.field] ?? '')), s.nextCode.prefix, s.nextCode.digits)
    return v
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const set = (key: string, val: string | boolean) => {
    setValues((prev) => {
      const next = { ...prev, [key]: val }
      return s.derive ? { ...next, ...s.derive(key, next, raw) } : next
    })
    setErrors((e) => ({ ...e, [key]: '' }))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs = validate(s, values, raw)
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      const payload = Object.fromEntries(s.fields.map((f) => [f.key, fromForm(f, values[f.key])]))
      await db.saveRow(s.table, payload, row?.id)
      notify('ok', row ? 'Saved' : 'Added')
      await onSaved()
      onClose()
    } catch (err) {
      notify('error', (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-navy-950/40" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="flex h-full w-full max-w-2xl flex-col bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <div className="text-[0.6875rem] font-semibold tracking-wider text-gold-600 uppercase">{s.title}</div>
            <div className="font-semibold">{row ? `Edit ${display(s.fields[0], row[s.fields[0].key], raw)}` : 'Add new'}</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-gold-50" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="scroll-thin grid flex-1 grid-cols-1 content-start gap-4 overflow-y-auto p-5 sm:grid-cols-2">
          {s.fields.map((f) => (
            <label key={f.key} className={f.wide || f.type === 'textarea' ? 'sm:col-span-2' : ''}>
              <span className="mb-1 flex items-baseline justify-between gap-2 text-xs font-semibold text-ink-2">
                <span>{f.label}{f.required && <span className="text-bad"> *</span>}</span>
                {errors[f.key] && <span className="font-medium text-bad">{errors[f.key]}</span>}
              </span>
              <Input f={f} value={values[f.key]} onChange={(v) => set(f.key, v)} raw={raw} invalid={!!errors[f.key]} />
              {f.hint && <span className="mt-1 block text-[0.6875rem] text-muted">{f.hint}</span>}
            </label>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-4">
          <span className="text-[0.6875rem] text-muted"><span className="text-bad">*</span> required · saved straight to the database, the dashboard updates at once</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-line px-4 py-2 text-sm hover:bg-gold-50">Cancel</button>
            <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl bg-navy-900 px-5 py-2 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-60">
              {busy && <Loader2 size={15} className="animate-spin" />}{row ? 'Save changes' : 'Add'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

function Input({ f, value, onChange, raw, invalid }: { f: Field; value: string | boolean; onChange: (v: string | boolean) => void; raw: RawTables; invalid: boolean }) {
  const cls = `input ${invalid ? '!border-bad' : ''}`
  if (f.type === 'bool') return <span className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[#0f1d33]" /> Yes</span>
  if (f.type === 'textarea') return <textarea value={String(value)} onChange={(e) => onChange(e.target.value)} rows={2} className={`${cls} h-auto py-2`} />
  if (f.type === 'select' || f.type === 'ref') {
    const opts: [string, string][] = f.type === 'ref' ? refOptions(f.ref!, raw) : (f.options ?? []).map((o) => [o, o])
    return (
      <select value={String(value)} onChange={(e) => onChange(e.target.value)} className={cls}>
        <option value="">{f.required ? 'Choose…' : '—'}</option>
        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    )
  }
  const type = f.type === 'date' ? 'date' : f.type === 'month' ? 'month' : 'text'
  const mode = ['money', 'number', 'pct'].includes(f.type) ? 'decimal' : undefined
  return (
    <span className="relative block">
      <input type={type} inputMode={mode} value={String(value)} onChange={(e) => onChange(e.target.value)} className={`${cls} ${f.type === 'pct' ? 'pr-8' : ''}`} />
      {f.type === 'pct' && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted">%</span>}
    </span>
  )
}

// ---------------------------------------------------------------- Company Info

function CompanyInfo({ raw }: { raw: RawTables }) {
  const { user, notify, refresh } = useStore()
  const canEdit = can(user, 'uploadData') || can(user, 'manageUsers')
  const saved = useMemo(() => new Map(raw.settings.map((r) => [r.key, r.value ?? ''])), [raw.settings])
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(QUESTIONS.map((q) => [qkey(q.q), saved.get(qkey(q.q)) ?? q.suggested ?? ''])))
  const [busy, setBusy] = useState(false)
  const topics = [...new Set(QUESTIONS.map((q) => q.topic))]
  const answered = QUESTIONS.filter((q) => (values[qkey(q.q)] ?? '').trim()).length

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await db.saveSettings(values)
      notify('ok', 'Company Info saved')
      await refresh()
    } catch (err) {
      notify('error', (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6875rem] font-semibold tracking-wider text-gold-600 uppercase">Start</div>
          <h1 className="text-2xl font-semibold text-navy-900">Company Info</h1>
          <p className="mt-0.5 text-sm text-muted">Contacts, accounts, your systems, rules, alerts, reports and statements. {answered} of {QUESTIONS.length} answered.</p>
        </div>
        {canEdit && <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl bg-navy-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy && <Loader2 size={15} className="animate-spin" />}Save answers</button>}
      </div>
      {topics.map((t) => (
        <section key={t} className="rounded-2xl border border-line bg-surface">
          <div className="border-b border-line px-5 py-3 text-sm font-semibold text-navy-900">{t}</div>
          <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
            {QUESTIONS.filter((q) => q.topic === t).map((q) => {
              const k = qkey(q.q)
              const v = values[k] ?? ''
              return (
                <label key={k} className="block">
                  <span className="mb-1 block text-xs font-semibold text-ink-2">{q.q}{q.required && <span className="text-bad"> *</span>}</span>
                  {q.kind === 'list' ? (
                    <select disabled={!canEdit} value={v} onChange={(e) => setValues({ ...values, [k]: e.target.value })} className="input">
                      <option value="">Choose…</option>
                      {q.options!.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input disabled={!canEdit} type={q.kind === 'month' ? 'month' : 'text'} inputMode={q.kind === 'number' || q.kind === 'money' ? 'decimal' : undefined} value={q.kind === 'month' ? v.slice(0, 7) : v} onChange={(e) => setValues({ ...values, [k]: e.target.value })} className="input" />
                  )}
                  {q.help && <span className="mt-1 block text-[0.6875rem] text-muted">{q.help}</span>}
                </label>
              )
            })}
          </div>
        </section>
      ))}
    </form>
  )
}
