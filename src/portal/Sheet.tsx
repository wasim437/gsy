import { AlertCircle, ClipboardPaste, Loader2, Plus, Save, Trash2, Undo2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import * as db from '../data/db'
import type { DbRow, RawTables } from '../data/db'
import { useStore } from '../data/store'
import { defaults, fromForm, fromPaste, nextCode, rowLabel, toForm, validate, NUMERIC, type Values } from './fields'
import { refOptions, type Field, type Section } from './sections'

const WIDTH: Record<string, number> = { text: 170, textarea: 230, number: 100, money: 130, pct: 92, date: 150, month: 130, select: 160, ref: 210, bool: 70 }
const BLANK_ROWS = 5

type Fresh = { key: string; values: Values; touched: boolean }
let seq = 0
const blank = (s: Section): Fresh => ({ key: `new-${++seq}`, values: Object.fromEntries(s.fields.map((f) => [f.key, f.type === 'bool' ? false : ''])), touched: false })

/**
 * Excel-style entry: every record is a row, every field a column. Type straight into the cells,
 * paste rows copied from Excel, then save all changes at once.
 */
export default function Sheet({ s, raw, rows, canEdit, onSaved }: { s: Section; raw: RawTables; rows: DbRow[]; canEdit: boolean; onSaved: () => Promise<void> }) {
  const { notify } = useStore()
  const [edits, setEdits] = useState<Record<string, Values>>({})
  const [fresh, setFresh] = useState<Fresh[]>(() => Array.from({ length: BLANK_ROWS }, () => blank(s)))
  const [errors, setErrors] = useState<Record<string, Record<string, string>>>({})
  const [rowError, setRowError] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const grid = useRef<HTMLTableElement>(null)

  const opts = useMemo(() => Object.fromEntries(s.fields.filter((f) => f.type === 'ref').map((f) => [f.key, refOptions(f.ref!, raw)])), [s, raw])

  const valuesOf = (r: DbRow): Values => ({ ...Object.fromEntries(s.fields.map((f) => [f.key, toForm(f, r[f.key])])), ...edits[r.id] })
  const changedRows = rows.filter((r) => edits[r.id] && Object.keys(edits[r.id]).length)
  const newRows = fresh.filter((f) => f.touched)
  const pending = changedRows.length + newRows.length

  // Warn before leaving with unsaved cells.
  useEffect(() => {
    if (!pending) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [pending])

  const usedCodes = () => s.nextCode ? [...rows.map((r) => String(r[s.nextCode!.field] ?? '')), ...fresh.map((f) => String(f.values[s.nextCode!.field] ?? ''))] : []

  /** Apply several cell changes at once (typing one cell, or a whole pasted block). */
  const apply = (changes: { row: number; key: string; value: string | boolean }[]) => {
    const extra = Math.max(0, ...changes.map((c) => c.row - rows.length - fresh.length + 1))
    let nextFresh = extra ? [...fresh, ...Array.from({ length: extra }, () => blank(s))] : [...fresh]
    const nextEdits = { ...edits }
    const codes = usedCodes()
    for (const c of changes) {
      if (c.row < rows.length) {
        const r = rows[c.row]
        const cur = { ...valuesOf(r), ...nextEdits[r.id], [c.key]: c.value }
        const derived = s.derive ? s.derive(c.key, cur, raw) : {}
        const mine: Values = { ...nextEdits[r.id], [c.key]: c.value, ...derived }
        // Drop cells that are back to their saved value.
        for (const k of Object.keys(mine)) {
          const f = s.fields.find((x) => x.key === k)!
          if (String(toForm(f, r[k])) === String(mine[k])) delete mine[k]
        }
        nextEdits[r.id] = mine
      } else {
        const i = c.row - rows.length
        const row = nextFresh[i]
        let values = { ...row.values, [c.key]: c.value }
        if (!row.touched) {
          // First entry in a blank row: fill the usual defaults and the next code, like the form does.
          const d = defaults(s)
          for (const f of s.fields) if (values[f.key] === '' || (f.type === 'bool' && f.key !== c.key)) values[f.key] = d[f.key]
          values[c.key] = c.value
          if (s.nextCode && !values[s.nextCode.field]) {
            const code = nextCode(codes, s.nextCode.prefix, s.nextCode.digits)
            codes.push(code)
            values[s.nextCode.field] = code
          }
        }
        if (s.derive) values = { ...values, ...s.derive(c.key, values, raw) }
        nextFresh[i] = { ...row, values, touched: true }
      }
    }
    if (nextFresh.length && nextFresh[nextFresh.length - 1].touched) nextFresh = [...nextFresh, blank(s)]
    setEdits(nextEdits)
    setFresh(nextFresh)
    const keys = new Set(changes.map((c) => (c.row < rows.length ? rows[c.row].id : nextFresh[c.row - rows.length].key)))
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !keys.has(k))))
    setRowError((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !keys.has(k))))
  }

  const focusCell = (r: number, c: number) => {
    const el = grid.current?.querySelector<HTMLElement>(`[data-r="${r}"][data-c="${c}"]`)
    el?.focus()
    if (el instanceof HTMLInputElement && el.type === 'text') el.select()
  }

  const onKey = (e: KeyboardEvent<HTMLElement>, r: number, c: number) => {
    const total = rows.length + fresh.length
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); return }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && r > 0) {
      e.preventDefault()
      const f = s.fields[c]
      const above = r - 1 < rows.length ? valuesOf(rows[r - 1])[f.key] : fresh[r - 1 - rows.length].values[f.key]
      apply([{ row: r, key: f.key, value: above }])
      return
    }
    const isSelect = e.currentTarget.tagName === 'SELECT'
    if (e.key === 'ArrowDown' && isSelect) return
    if (e.key === 'ArrowUp' && isSelect) return
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault()
      if (r + 1 >= total) setFresh((f) => [...f, blank(s)])
      setTimeout(() => focusCell(r + 1, c))
    } else if (e.key === 'ArrowUp' && r > 0) {
      e.preventDefault()
      focusCell(r - 1, c)
    }
  }

  const onPaste = (e: ClipboardEvent<HTMLElement>, r: number, c: number) => {
    const text = e.clipboardData.getData('text/plain')
    if (!/[\t\n]/.test(text.replace(/\r?\n$/, ''))) return // a single value: let the cell take it normally
    e.preventDefault()
    const lines = text.replace(/\r/g, '').replace(/\n$/, '').split('\n')
    const changes: { row: number; key: string; value: string | boolean }[] = []
    lines.forEach((line, i) => line.split('\t').forEach((cell, j) => {
      const f = s.fields[c + j]
      if (f) changes.push({ row: r + i, key: f.key, value: fromPaste(f, cell, raw) })
    }))
    apply(changes)
    notify('ok', `Pasted ${lines.length} row${lines.length === 1 ? '' : 's'}. Check the cells, then press Save.`)
  }

  const discard = () => {
    setEdits({})
    setFresh(Array.from({ length: BLANK_ROWS }, () => blank(s)))
    setErrors({})
    setRowError({})
  }

  async function save() {
    if (!pending || busy) return
    // Check everything first, so nothing half-saves because of one typo.
    const errs: Record<string, Record<string, string>> = {}
    for (const r of changedRows) { const x = validate(s, valuesOf(r), raw); if (Object.keys(x).length) errs[r.id] = x }
    for (const f of newRows) { const x = validate(s, f.values, raw); if (Object.keys(x).length) errs[f.key] = x }
    setErrors(errs)
    if (Object.keys(errs).length) {
      notify('error', `${Object.keys(errs).length} row${Object.keys(errs).length === 1 ? ' needs' : 's need'} fixing: see the red cells.`)
      return
    }
    setBusy(true)
    const failed: Record<string, string> = {}
    let saved = 0
    for (const r of changedRows) {
      try {
        await db.saveRow(s.table, Object.fromEntries(Object.entries(edits[r.id]).map(([k, v]) => [k, fromForm(s.fields.find((f) => f.key === k)!, v)])), r.id)
        saved++
      } catch (err) { failed[r.id] = (err as Error).message }
    }
    for (const f of newRows) {
      try {
        await db.saveRow(s.table, Object.fromEntries(s.fields.map((x) => [x.key, fromForm(x, f.values[x.key])])))
        saved++
      } catch (err) { failed[f.key] = (err as Error).message }
    }
    // Keep only what failed, so it can be fixed and saved again.
    setEdits((e) => Object.fromEntries(Object.entries(e).filter(([id]) => failed[id])))
    const keep = fresh.filter((f) => failed[f.key])
    setFresh([...keep, ...Array.from({ length: Math.max(1, BLANK_ROWS - keep.length) }, () => blank(s))])
    setRowError(failed)
    setBusy(false)
    if (saved) notify('ok', `Saved ${saved} row${saved === 1 ? '' : 's'}. The dashboard shows them now.`)
    if (Object.keys(failed).length) notify('error', `${Object.keys(failed).length} row${Object.keys(failed).length === 1 ? '' : 's'} could not be saved: see the message on the row.`)
    await onSaved()
  }

  const remove = async (r: DbRow) => {
    if (!confirm(`Delete “${rowLabel(s, r, raw)}” from ${s.title}? This cannot be undone.`)) return
    try {
      await db.deleteRow(s.table, r.id)
      notify('ok', `Deleted ${rowLabel(s, r, raw)}`)
      await onSaved()
    } catch (err) {
      notify('error', (err as Error).message)
    }
  }

  const cell = (f: Field, value: string | boolean, r: number, c: number, changed: boolean, err?: string) => {
    const common = {
      'data-r': r, 'data-c': c, disabled: !canEdit || busy, title: err ?? f.hint ?? f.label,
      onKeyDown: (e: KeyboardEvent<HTMLElement>) => onKey(e, r, c),
      onPaste: (e: ClipboardEvent<HTMLElement>) => onPaste(e, r, c),
      className: `sheet-cell ${NUMERIC.includes(f.type) ? 'text-right' : ''} ${changed ? 'is-changed' : ''} ${err ? 'is-error' : ''}`,
    }
    if (f.type === 'bool') return <span className="flex h-9 items-center justify-center"><input type="checkbox" {...common} className="h-4 w-4" checked={Boolean(value)} onChange={(e) => apply([{ row: r, key: f.key, value: e.target.checked }])} /></span>
    if (f.type === 'select' || f.type === 'ref') {
      const list: [string, string][] = f.type === 'ref' ? opts[f.key] : (f.options ?? []).map((o) => [o, o])
      return (
        <select {...common} value={String(value)} onChange={(e) => apply([{ row: r, key: f.key, value: e.target.value }])}>
          <option value="">{f.required ? 'Choose…' : '—'}</option>
          {list.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          {value !== '' && !list.some(([v]) => v === value) && <option value={String(value)}>{String(value)} (not in list)</option>}
        </select>
      )
    }
    const type = f.type === 'date' ? 'date' : f.type === 'month' ? 'month' : 'text'
    return <input {...common} type={type} inputMode={NUMERIC.includes(f.type) ? 'decimal' : undefined} value={String(value)} onChange={(e) => apply([{ row: r, key: f.key, value: e.target.value }])} />
  }

  const width = 44 + s.fields.reduce((t, f) => t + (WIDTH[f.type] ?? 160), 0) + 56

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        {canEdit ? (
          <>
            <button onClick={() => void save()} disabled={!pending || busy} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-navy-900 px-4 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-40">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save {pending ? `${pending} row${pending === 1 ? '' : 's'}` : 'changes'}
            </button>
            <button onClick={discard} disabled={!pending || busy} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-sm text-ink-2 hover:bg-gold-50 disabled:opacity-40"><Undo2 size={15} /> Discard</button>
            <button onClick={() => setFresh((f) => [...f, ...Array.from({ length: 5 }, () => blank(s))])} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-sm text-ink-2 hover:bg-gold-50"><Plus size={15} /> 5 more rows</button>
            <span className="ml-auto hidden items-center gap-1.5 text-[0.6875rem] text-muted md:flex"><ClipboardPaste size={13} /> Copy rows in Excel and paste into any cell · Enter = next row · Ctrl+D = copy from above · Ctrl+S = save</span>
          </>
        ) : <span className="text-sm text-muted">You can view this sheet. Ask the Chairman for “Enter &amp; edit data” to make changes.</span>}
      </div>
      <div className="scroll-thin max-h-[calc(100vh-290px)] min-h-[320px] overflow-auto">
        <table ref={grid} className="sheet" style={{ minWidth: width }}>
          <colgroup>
            <col style={{ width: 44 }} />
            {s.fields.map((f) => <col key={f.key} style={{ width: WIDTH[f.type] ?? 160 }} />)}
            <col style={{ width: 56 }} />
          </colgroup>
          <thead>
            <tr>
              <th className="sheet-num">#</th>
              {s.fields.map((f) => <th key={f.key} title={f.hint} className={NUMERIC.includes(f.type) ? 'text-right' : ''}>{f.label}{f.required && <span className="text-bad"> *</span>}</th>)}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const v = valuesOf(r)
              const mine = edits[r.id] ?? {}
              const err = errors[r.id] ?? {}
              return (
                <tr key={r.id} className={rowError[r.id] ? 'has-error' : ''}>
                  <td className="sheet-num">{i + 1}</td>
                  {s.fields.map((f, c) => <td key={f.key}>{cell(f, v[f.key], i, c, f.key in mine, err[f.key])}</td>)}
                  <td className="text-center">
                    {rowError[r.id] ? <span title={rowError[r.id]} className="inline-flex text-bad"><AlertCircle size={16} /></span> : canEdit && (
                      <button onClick={() => void remove(r)} className="rounded-md p-1 text-muted hover:bg-bad-bg hover:text-bad" title="Delete row" aria-label="Delete row"><Trash2 size={14} /></button>
                    )}
                  </td>
                </tr>
              )
            })}
            {canEdit && fresh.map((f, j) => {
              const i = rows.length + j
              const err = errors[f.key] ?? {}
              return (
                <tr key={f.key} className={`is-new ${rowError[f.key] ? 'has-error' : ''}`}>
                  <td className="sheet-num">{f.touched ? <span className="font-bold text-gold-600">+</span> : i + 1}</td>
                  {s.fields.map((x, c) => <td key={x.key}>{cell(x, f.values[x.key], i, c, f.touched && String(f.values[x.key]) !== '', err[x.key])}</td>)}
                  <td className="text-center">
                    {rowError[f.key] ? <span title={rowError[f.key]} className="inline-flex text-bad"><AlertCircle size={16} /></span> : f.touched && (
                      <button onClick={() => setFresh((list) => list.filter((x) => x.key !== f.key))} className="rounded-md p-1 text-muted hover:bg-bad-bg hover:text-bad" title="Clear row" aria-label="Clear row"><Trash2 size={14} /></button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {Object.keys(rowError).length > 0 && (
        <div className="border-t border-line px-4 py-2.5 text-xs text-bad">
          {Object.entries(rowError).map(([k, m]) => <div key={k}>Row {k.startsWith('new-') ? 'new' : rows.findIndex((r) => r.id === k) + 1}: {m}</div>)}
        </div>
      )}
    </div>
  )
}
