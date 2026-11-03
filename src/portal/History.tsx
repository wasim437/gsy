import { ArrowRight, Download, History as HistoryIcon, Loader2, RefreshCw, Search, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CHANGELOG } from '../data/changelog'
import { QUESTIONS, qkey } from '../data/companyInfo'
import * as db from '../data/db'
import type { DbRow, RawTables } from '../data/db'
import { useStore } from '../data/store'
import { display } from './fields'
import { SECTIONS } from './sections'

const OTHER: Record<string, string> = { profiles: 'Users & Access', roles: 'Roles', invites: 'Invites', settings: 'Company Info' }
const ACTION: Record<string, { label: string; cls: string }> = {
  insert: { label: 'Added', cls: 'bg-good-bg text-good' },
  update: { label: 'Changed', cls: 'bg-warn-bg text-warn' },
  delete: { label: 'Deleted', cls: 'bg-bad-bg text-bad' },
}
const LABEL_KEYS = ['full_name', 'name', 'contract_no', 'investor_code', 'lead_name', 'bank_name', 'email', 'key']

function when(at: string) {
  const d = new Date(at)
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Admin Portal → History: every change with who, when and old → new, plus the app's update notes. */
export default function History({ raw }: { raw: RawTables }) {
  const { notify, dbMode } = useStore()
  const [tab, setTab] = useState<'changes' | 'updates'>('changes')
  const [rows, setRows] = useState<DbRow[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [who, setWho] = useState('')
  const [what, setWhat] = useState('')

  const load = useCallback(async () => {
    if (!dbMode) { setRows([]); return }
    setBusy(true)
    try { setRows(await db.loadHistory(1000)) } catch (e) { notify('error', (e as Error).message) } finally { setBusy(false) }
  }, [notify, dbMode])
  useEffect(() => { void load() }, [load])

  const sectionOf = (table: string) => SECTIONS.find((s) => s.table === table)
  const tableName = (t: string) => sectionOf(t)?.title ?? OTHER[t] ?? t.replace(/_/g, ' ')

  const fieldLabel = (table: string, key: string) => {
    if (table === 'settings') return QUESTIONS.find((x) => qkey(x.q) === key)?.q ?? key
    return sectionOf(table)?.fields.find((f) => f.key === key)?.label ?? key.replace(/_/g, ' ')
  }
  const show = (table: string, key: string, v: unknown) => {
    if (v === null || v === undefined || v === '') return '—'
    const f = sectionOf(table)?.fields.find((x) => x.key === key)
    if (f) return display(f, v, raw)
    if (Array.isArray(v)) return v.join(', ') || '—'
    return String(v)
  }

  /** What the entry is about, e.g. "INV-0003 · Mozard Antia" or the Company Info question. */
  const subject = (r: DbRow) => {
    const s = sectionOf(r.table_name)
    const live = s ? raw[s.table].find((x) => x.id === r.record_id) : undefined
    if (s && live) return display(s.fields[0], live[s.fields[0].key], raw)
    if (r.table_name === 'settings') return fieldLabel('settings', r.record_id)
    const d = r.details ?? {}
    for (const k of LABEL_KEYS) {
      const v = Array.isArray(d[k]) ? d[k][1] ?? d[k][0] : d[k]
      if (v) return String(v)
    }
    return r.record_id ? `Record ${String(r.record_id).slice(0, 8)}` : ''
  }

  const changes = (r: DbRow): { label: string; from?: string; to: string }[] => {
    const d = r.details as Record<string, unknown> | null
    if (!d) return []
    if (r.action === 'update') {
      return Object.entries(d).filter(([k]) => k !== 'id').map(([k, v]) => {
        const [a, b] = v as [unknown, unknown]
        return { label: fieldLabel(r.table_name, k), from: show(r.table_name, k, a), to: show(r.table_name, k, b) }
      })
    }
    const s = sectionOf(r.table_name)
    const keys = s ? s.list : Object.keys(d).filter((k) => !['id', 'import_key', 'permissions', 'countries'].includes(k)).slice(0, 4)
    return keys.filter((k) => d[k] !== null && d[k] !== undefined && d[k] !== '').map((k) => ({ label: fieldLabel(r.table_name, k), to: show(r.table_name, k, d[k]) }))
  }

  const people = useMemo(() => [...new Set((rows ?? []).map((r) => r.user_name ?? '—'))].sort(), [rows])
  const tables = useMemo(() => [...new Set((rows ?? []).filter((r) => r.table_name).map((r) => r.table_name as string))], [rows])
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (rows ?? []).filter((r) => (!who || r.user_name === who) && (!what || r.table_name === what) && (!term || JSON.stringify([r.user_name, r.action, tableName(r.table_name ?? ''), subject(r), r.details]).toLowerCase().includes(term)))
  }, [rows, q, who, what]) // eslint-disable-line react-hooks/exhaustive-deps

  const exportCsv = () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
    const lines = [['When', 'Who', 'Action', 'Section', 'Record', 'Details'].join(',')]
    for (const r of shown) {
      const detail = changes(r).map((c) => (c.from !== undefined ? `${c.label}: ${c.from} -> ${c.to}` : `${c.label}: ${c.to}`)).join('; ')
      lines.push([when(r.at), r.user_name ?? '', r.table_name ? ACTION[r.action]?.label ?? r.action : r.action, r.table_name ? tableName(r.table_name) : '', subject(r), detail].map((x) => esc(String(x))).join(','))
    }
    const url = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `GSY_history_${new Date().toISOString().slice(0, 10)}.csv` })
    a.click()
    URL.revokeObjectURL(url)
  }

  const hasDetails = (rows ?? []).some((r) => 'details' in r)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6875rem] font-semibold tracking-wider text-gold-600 uppercase">Tools</div>
          <h1 className="text-2xl font-semibold text-navy-900">History</h1>
          <p className="mt-0.5 text-sm text-muted">Every change saved in the portal: who made it, when, and what it was before and after. Plus the app’s update notes.</p>
        </div>
        <div className="flex rounded-xl border border-line bg-surface p-1">
          {(['changes', 'updates'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === t ? 'bg-navy-900 text-white' : 'text-muted hover:text-ink'}`}>
              {t === 'changes' ? <><HistoryIcon size={15} /> Change log</> : <><Sparkles size={15} /> App updates</>}
            </button>
          ))}
        </div>
      </div>

      {tab === 'updates' ? (
        <div className="flex flex-col gap-3">
          {CHANGELOG.map((r, i) => (
            <div key={r.version} className="rounded-2xl border border-line bg-surface p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${i === 0 ? 'bg-gold-500 text-navy-950' : 'bg-line-2 text-ink-2'}`}>v{r.version}</span>
                {i === 0 && <span className="text-[0.6875rem] font-semibold text-good">Current</span>}
                <span className="text-xs text-muted">{new Date(r.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
              </div>
              <div className="mt-2 font-semibold">{r.title}</div>
              <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-ink-2">{r.items.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-surface">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            <div className="flex min-w-[200px] flex-1 items-center gap-2">
              <Search size={16} className="text-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search names, amounts, fields…" className="w-full bg-transparent text-sm outline-none" />
            </div>
            <select value={who} onChange={(e) => setWho(e.target.value)} className="input h-9 w-auto"><option value="">Everyone</option>{people.map((p) => <option key={p}>{p}</option>)}</select>
            <select value={what} onChange={(e) => setWhat(e.target.value)} className="input h-9 w-auto"><option value="">All sections</option>{tables.map((t) => <option key={t} value={t}>{tableName(t)}</option>)}</select>
            <button onClick={() => void load()} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-sm hover:bg-gold-50" title="Reload"><RefreshCw size={15} className={busy ? 'animate-spin' : ''} /></button>
            <button onClick={exportCsv} disabled={!shown.length} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-sm hover:bg-gold-50 disabled:opacity-40"><Download size={15} /> CSV</button>
          </div>
          {rows && !hasDetails && rows.length > 0 && (
            <div className="border-b border-line bg-warn-bg px-4 py-2.5 text-xs text-warn">Old and new values are recorded once the “history” SQL (supabase/migrations/002_history.sql) has been run in Supabase.</div>
          )}
          {rows === null ? (
            <div className="flex justify-center py-14"><Loader2 className="animate-spin text-gold-600" /></div>
          ) : shown.length === 0 ? (
            <div className="px-4 py-14 text-center text-sm text-muted">No changes yet. Everything added, changed or deleted in the portal appears here.</div>
          ) : (
            <ol className="scroll-thin max-h-[calc(100vh-280px)] divide-y divide-line-2 overflow-y-auto">
              {shown.map((r) => {
                const a = ACTION[r.action]
                const list = changes(r)
                return (
                  <li key={r.id} className="flex gap-3 px-4 py-3">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gold-100 text-[0.6875rem] font-bold text-gold-600">{String(r.user_name ?? '?').split(/\s+/).map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        <b>{r.user_name ?? '—'}</b>
                        {a ? <span className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ${a.cls}`}>{a.label}</span> : <span className="text-ink-2">{r.action}</span>}
                        {r.table_name && <span className="text-ink-2">{tableName(r.table_name)}</span>}
                        {r.table_name && <span className="font-medium">· {subject(r)}</span>}
                        <span className="ml-auto text-xs text-muted">{when(r.at)}</span>
                      </div>
                      {list.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {list.map((c) => (
                            <span key={c.label} className="inline-flex max-w-full items-center gap-1 rounded-lg bg-page px-2 py-1 text-xs">
                              <span className="text-muted">{c.label}:</span>
                              {c.from !== undefined && <><span className="text-bad line-through decoration-bad/40">{c.from}</span><ArrowRight size={11} className="shrink-0 text-muted" /></>}
                              <span className="truncate font-medium">{c.to}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      )}
    </div>
  )
}
