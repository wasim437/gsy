import { ArrowRight, Bell } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as db from '../data/db'
import type { DbRow } from '../data/db'
import { can, useStore } from '../data/store'
import { adminHref } from '../lib/site'
import { display } from '../portal/fields'
import { SECTIONS } from '../portal/sections'

const SEEN = 'gsy.bell.seen'
const ACTION: Record<string, string> = { insert: 'added', update: 'changed', delete: 'deleted' }

function ago(at: string) {
  const m = Math.round((Date.now() - new Date(at).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`
  return new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** Dashboard bell: what the team changed in the Admin Portal, newest first, with old → new values. */
export default function ChangesBell() {
  const { user, dbMode, raw, refresh } = useStore()
  const [rows, setRows] = useState<DbRow[]>([])
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(() => { try { return localStorage.getItem(SEEN) ?? '' } catch { return '' } })
  const box = useRef<HTMLDivElement>(null)
  const allowed = dbMode && (can(user, 'manageUsers') || can(user, 'uploadData'))

  useEffect(() => {
    if (!allowed) return
    let latest = ''
    const load = async () => {
      try {
        const list = (await db.loadHistory(30)).filter((r) => r.table_name && r.table_name !== 'settings')
        setRows(list)
        // New data entered elsewhere: refresh the dashboard numbers too.
        if (latest && list[0]?.at && list[0].at > latest) void refresh()
        latest = list[0]?.at ?? latest
      } catch { /* history not readable for this role */ }
    }
    void load()
    const t = setInterval(() => void load(), 60_000)
    return () => clearInterval(t)
  }, [allowed, refresh])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const unread = rows.filter((r) => r.at > seen).length
  const items = useMemo(() => rows.map((r) => {
    const s = SECTIONS.find((x) => x.table === r.table_name)
    const live = s && raw ? raw[s.table].find((x) => x.id === r.record_id) : undefined
    const d = (r.details ?? {}) as Record<string, unknown>
    const name = s && live && raw ? display(s.fields[0], live[s.fields[0].key], raw) : String((d.full_name ?? d.name ?? d.contract_no ?? d.lead_name ?? '') as string)
    const changes = r.action === 'update' && s && raw
      ? Object.entries(d).slice(0, 2).map(([k, v]) => {
        const f = s.fields.find((x) => x.key === k)
        const [a, b] = v as [unknown, unknown]
        return f ? `${f.label}: ${display(f, a, raw)} → ${display(f, b, raw)}` : ''
      }).filter(Boolean)
      : []
    return { r, title: `${r.user_name ?? 'Someone'} ${ACTION[r.action] ?? r.action} ${s?.title.toLowerCase() ?? r.table_name.replace(/_/g, ' ')}`, name, changes }
  }), [rows, raw])

  if (!allowed) return null
  const toggle = () => {
    setOpen((o) => !o)
    if (rows[0]) {
      try { localStorage.setItem(SEEN, rows[0].at) } catch { /* storage blocked */ }
      setSeen(rows[0].at)
    }
  }

  return (
    <div ref={box} className="relative">
      <button onClick={toggle} className="relative grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface text-ink-2 hover:border-gold-500" title="Changes from the Admin Portal" aria-label="Changes from the Admin Portal">
        <Bell size={15} />
        {unread > 0 && <span className="absolute -top-1.5 -right-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-bad px-1 text-[0.625rem] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="fixed inset-x-3 top-16 z-50 overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-[380px]">
          <div className="border-b border-line px-4 py-3 text-sm font-semibold">Latest changes</div>
          <ol className="scroll-thin max-h-[55vh] divide-y divide-line-2 overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">No changes yet.</li>}
            {items.map(({ r, title, name, changes }) => (
              <li key={r.id} className="px-4 py-2.5 text-xs">
                <div className="flex justify-between gap-2"><span className="font-semibold text-ink">{title}</span><span className="shrink-0 text-muted">{ago(r.at)}</span></div>
                {name && <div className="mt-0.5 text-ink-2">{name}</div>}
                {changes.map((c) => <div key={c} className="mt-0.5 text-muted">{c}</div>)}
              </li>
            ))}
          </ol>
          <a href={adminHref('history')} className="flex items-center justify-center gap-1.5 border-t border-line px-4 py-2.5 text-xs font-semibold text-gold-600 hover:bg-gold-50">Open the full history <ArrowRight size={13} /></a>
        </div>
      )}
    </div>
  )
}
