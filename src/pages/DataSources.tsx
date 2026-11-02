import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Info, Loader2, RotateCcw, Upload, XCircle } from 'lucide-react'
import { useRef, useState } from 'react'
import { Badge, Btn, Card, Kpi, PageHeader, StatusBadge, TableWrap } from '../components/ui'
import { dataQuality } from '../data/engine'
import { can, useStore } from '../data/store'
import type { Dataset } from '../data/types'

function downloadCSV(name: string, rows: object[]) {
  if (!rows.length) return
  const cols = Object.keys(rows[0])
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc((r as Record<string, unknown>)[c])).join(','))].join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = `${name}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

const TABLES: [string, keyof Dataset][] = [
  ['Investors', 'investors'], ['Contracts', 'contracts'], ['Payouts_Paid', 'payoutsPaid'], ['Commission_Paid', 'commissionsPaid'],
  ['Expenses', 'expenses'], ['Internal_Investments', 'internalInvestments'], ['CRM_Pipeline', 'leads'], ['FX_Rates', 'fxRates'],
  ['Companies', 'companies'], ['Products', 'products'], ['SalesPeople', 'salesPeople'], ['Bank_Balance', 'bankBalances'],
]

export default function DataSources() {
  const { ds, user, imported, applyImport, clearImport, today } = useStore()
  const dq = dataQuality(ds)
  const issues = dq.reduce((s, d) => s + d.items.length, 0)
  const canEdit = can(user, 'uploadData')

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Data Sources & Checks"
        subtitle="Where every figure comes from, when it was last updated, and what needs fixing in the source Excel files"
        actions={<>
          {can(user, 'exportData') && <Btn icon={<Download size={15} />} onClick={() => TABLES.forEach(([n, k], i) => setTimeout(() => downloadCSV(n, ds[k] as object[]), i * 250))}>Export all data</Btn>}
        </>}
      />
      {canEdit && <ImportPanel imported={imported} onApply={applyImport} onClear={clearImport} today={today} />}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi label="Connected tables"><span className="num text-2xl font-semibold sm:text-3xl">{ds.syncLog.length}</span></Kpi>
        <Kpi label="Healthy" accent="good"><span className="num text-2xl font-semibold sm:text-3xl text-good">{ds.syncLog.filter((s) => s.status === 'OK').length}</span></Kpi>
        <Kpi label="Need attention" accent="bad"><span className="num text-2xl font-semibold sm:text-3xl text-warn">{ds.syncLog.filter((s) => s.status !== 'OK').length}</span></Kpi>
        <Kpi label="Open data issues"><span className="num text-2xl font-semibold sm:text-3xl">{issues}</span></Kpi>
      </div>

      <Card title="Sync status" subtitle={imported ? `Read from ${imported.fileName} on ${new Date(imported.importedAt).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', dateStyle: 'medium', timeStyle: 'short' })}` : 'Sample data. Import GSY’s Excel above to replace it.'}>
        <TableWrap max="">
          <table className="tbl">
            <thead><tr><th>Table</th><th>Source</th><th>Last sync</th><th className="r">Rows</th><th>Status</th><th>Note</th><th></th></tr></thead>
            <tbody>
              {ds.syncLog.map((s) => {
                const key = TABLES.find(([n]) => n === s.table)?.[1]
                return (
                  <tr key={s.table}>
                    <td className="font-medium"><span className="inline-flex items-center gap-2"><FileSpreadsheet size={15} className="text-good" />{s.table}</span></td>
                    <td className="text-ink-2">{s.source}</td>
                    <td>{s.lastSync.slice(0, 10)} {s.lastSync.slice(11, 16)}</td>
                    <td className="r">{s.rows.toLocaleString()}</td>
                    <td><StatusBadge s={s.status} /></td>
                    <td className="text-xs text-muted">{s.note || '—'}</td>
                    <td>{key && <button onClick={() => downloadCSV(s.table, ds[key] as object[])} className="text-xs font-medium text-gold-600 hover:underline">CSV</button>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {dq.map((d) => (
          <Card key={d.check} title={<span className="flex items-center gap-2">{d.items.length ? <Badge tone="warn">{d.items.length}</Badge> : <CheckCircle2 size={16} className="text-good" />}{d.check}</span>} subtitle={`Source table: ${d.table}`}>
            {d.items.length ? (
              <ul className="flex max-h-40 flex-col gap-1 overflow-auto text-xs text-ink-2">{d.items.map((x) => <li key={x} className="rounded-lg bg-page px-2.5 py-1.5">{x}</li>)}</ul>
            ) : (
              <p className="text-sm text-good">All clear</p>
            )}
          </Card>
        ))}
      </div>

      <Card title="Ownership & backups">
        <ul className="grid grid-cols-1 gap-2 text-sm text-ink-2 md:grid-cols-2">
          <li>• All accounts (database, hosting, Google Cloud, email) are registered to GSY’s project email.</li>
          <li>• Daily automatic database backups, plus “Export all data” above for a full CSV copy.</li>
          <li>• Source Excel files remain the record of truth; the system never edits the ledger.</li>
          <li>• Source code and administrator access are handed over at go-live.</li>
        </ul>
      </Card>
    </div>
  )
}

type ImportResult = NonNullable<ReturnType<typeof useStore>['imported']>

function ImportPanel({ imported, onApply, onClear, today }: { imported: ImportResult | null; onApply: (r: ImportResult) => void; onClear: () => void; today: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [drag, setDrag] = useState(false)
  const run = async (file?: File | null) => {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const { importWorkbook } = await import('../data/importExcel') // loaded only when needed
      onApply(await importWorkbook(file, today))
    } catch (e) {
      setError(`Could not read this file: ${(e as Error).message}`)
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }
  const order = { error: 0, warning: 1, info: 2 } as const
  const issues = [...(imported?.issues ?? [])].sort((a, b) => order[a.level] - order[b.level])
  const errors = issues.filter((i) => i.level === 'error').length
  const warnings = issues.filter((i) => i.level === 'warning').length

  return (
    <Card
      title={<span className="flex items-center gap-2"><FileSpreadsheet size={17} className="text-good" /> GSY Excel data</span>}
      subtitle="The file is read inside this browser. It is not uploaded anywhere."
      action={imported && <Btn variant="ghost" icon={<RotateCcw size={14} />} onClick={onClear}>Back to sample data</Btn>}
    >
      <label
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); run(e.dataTransfer.files?.[0]) }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition ${drag ? 'border-gold-500 bg-gold-50' : 'border-line hover:border-gold-500'}`}
      >
        {busy ? <Loader2 size={26} className="animate-spin text-gold-600" /> : <Upload size={26} className="text-gold-600" />}
        <span className="text-sm font-semibold">{busy ? 'Reading the Excel…' : imported ? 'Import an updated Excel' : 'Import GSY_Data_Entry.xlsx'}</span>
        <span className="text-xs text-muted">Click to choose the file, or drag it here</span>
        <input ref={input} type="file" accept=".xlsx,.xlsm,.xls" className="hidden" onChange={(e) => run(e.target.files?.[0])} />
      </label>
      {error && <p className="mt-3 text-sm text-bad">{error}</p>}

      {imported && (
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={errors ? 'bad' : 'good'}>{errors ? `${errors} to fix` : 'No blocking problems'}</Badge>
            {warnings > 0 && <Badge tone="warn">{warnings} warnings</Badge>}
            <span className="text-muted">{imported.fileName} · imported {new Date(imported.importedAt).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', dateStyle: 'medium', timeStyle: 'short' })} · Company Info: {imported.settings.answered} of {imported.settings.questions} answered</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6">
            {Object.entries(imported.counts).map(([k, v]) => (
              <div key={k} className={`rounded-xl px-3 py-2 ${v ? 'bg-page' : 'bg-warn-bg'}`}>
                <div className="text-[0.6875rem] text-muted">{k}</div>
                <div className={`num text-lg font-semibold ${v ? '' : 'text-warn'}`}>{v}</div>
              </div>
            ))}
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold text-muted">What to fix in the Excel ({issues.length})</div>
            <ul className="flex flex-col gap-1.5">
              {issues.map((i, n) => (
                <li key={n} className={`flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${i.level === 'error' ? 'bg-bad-bg' : i.level === 'warning' ? 'bg-warn-bg' : 'bg-page'}`}>
                  {i.level === 'error' ? <XCircle size={15} className="mt-0.5 shrink-0 text-bad" /> : i.level === 'warning' ? <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" /> : <Info size={15} className="mt-0.5 shrink-0 text-muted" />}
                  <span><b className="text-ink">{i.sheet}:</b> <span className="text-ink-2">{i.message}</span></span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Card>
  )
}
