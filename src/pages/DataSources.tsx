import { CheckCircle2, Download, FileSpreadsheet, RefreshCw, Upload } from 'lucide-react'
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
  const { ds, user } = useStore()
  const dq = dataQuality(ds)
  const issues = dq.reduce((s, d) => s + d.items.length, 0)
  const canEdit = can(user, 'uploadData')

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Data Sources & Checks"
        subtitle="Where every figure comes from, when it was last updated, and what needs fixing in the source Excel files"
        actions={<>
          {canEdit && <Btn variant="ghost" icon={<Upload size={15} />}>Upload Excel</Btn>}
          {canEdit && <Btn variant="ghost" icon={<RefreshCw size={15} />}>Sync now</Btn>}
          {can(user, 'exportData') && <Btn icon={<Download size={15} />} onClick={() => TABLES.forEach(([n, k], i) => setTimeout(() => downloadCSV(n, ds[k] as object[]), i * 250))}>Export all data</Btn>}
        </>}
      />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi label="Connected tables"><span className="num text-2xl font-semibold sm:text-3xl">{ds.syncLog.length}</span></Kpi>
        <Kpi label="Healthy" accent="good"><span className="num text-2xl font-semibold sm:text-3xl text-good">{ds.syncLog.filter((s) => s.status === 'OK').length}</span></Kpi>
        <Kpi label="Need attention" accent="bad"><span className="num text-2xl font-semibold sm:text-3xl text-warn">{ds.syncLog.filter((s) => s.status !== 'OK').length}</span></Kpi>
        <Kpi label="Open data issues"><span className="num text-2xl font-semibold sm:text-3xl">{issues}</span></Kpi>
      </div>

      <Card title="Sync status" subtitle="Excel workbooks on SharePoint / OneDrive, read through Microsoft Graph · scheduled every 2 hours">
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
