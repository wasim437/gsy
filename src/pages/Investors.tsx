import { ArrowDownUp, Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Card, Kpi, PageHeader, StatusBadge, TableWrap } from '../components/ui'
import { investorTable, segmentOf } from '../data/engine'
import { useStore } from '../data/store'
import { fmtDate } from '../lib/dates'
import { compact, full, moneyEntries } from '../lib/format'

type SortKey = 'aed' | 'name' | 'profitPaid' | 'overdue' | 'next'

export default function Investors() {
  const { ctx } = useStore()
  const all = investorTable(ctx)
  const [q, setQ] = useState('')
  const [seg, setSeg] = useState<'All' | 'Platinum' | 'Gold' | 'Silver' | 'Overdue'>('All')
  const [sort, setSort] = useState<SortKey>('aed')

  const rows = all
    .filter((r) => !q || `${r.inv.fullName} ${r.inv.id} ${r.inv.city}`.toLowerCase().includes(q.toLowerCase()))
    .filter((r) => seg === 'All' || (seg === 'Overdue' ? r.overdue > 0.5 : segmentOf(r.aed) === seg))
    .sort((a, b) =>
      sort === 'name' ? a.inv.fullName.localeCompare(b.inv.fullName)
        : sort === 'next' ? (a.next ?? '9').localeCompare(b.next ?? '9')
        : b[sort] - a[sort],
    )
  const count = (s: string) => all.filter((r) => segmentOf(r.aed) === s).length

  const Th = ({ k, children, r }: { k: SortKey; children: React.ReactNode; r?: boolean }) => (
    <th className={r ? 'r' : ''}>
      <button onClick={() => setSort(k)} className={`inline-flex items-center gap-1 uppercase ${sort === k ? 'text-ink' : ''}`}>{children}<ArrowDownUp size={11} /></button>
    </th>
  )

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Investors" subtitle="Every investor, their capital, profit paid and what is due next. Open a name for the full portfolio." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Investors"><span className="num text-2xl font-semibold sm:text-3xl">{all.length}</span></Kpi>
        <Kpi label="Platinum (≥ AED 1M)"><span className="num text-2xl font-semibold sm:text-3xl">{count('Platinum')}</span></Kpi>
        <Kpi label="Gold (≥ AED 300K)"><span className="num text-2xl font-semibold sm:text-3xl">{count('Gold')}</span></Kpi>
        <Kpi label="Silver"><span className="num text-2xl font-semibold sm:text-3xl">{count('Silver')}</span></Kpi>
        <Kpi label="With overdue payouts" accent="bad"><span className="num text-2xl font-semibold sm:text-3xl text-bad">{all.filter((r) => r.overdue > 0.5).length}</span></Kpi>
      </div>

      <Card pad={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-5">
          <div className="flex flex-wrap gap-1 rounded-xl bg-page p-1">
            {(['All', 'Platinum', 'Gold', 'Silver', 'Overdue'] as const).map((s) => (
              <button key={s} onClick={() => setSeg(s)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${seg === s ? 'bg-navy-900 text-white' : 'text-muted hover:text-ink'}`}>{s}</button>
            ))}
          </div>
          <label className="flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm sm:w-72">
            <Search size={15} className="text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, ID or city" className="w-full bg-transparent outline-none" />
          </label>
        </div>
        <div className="p-4 sm:p-5">
          <TableWrap max="max-h-[640px]">
            <table className="tbl">
              <thead>
                <tr>
                  <Th k="name">Investor</Th><th>Country</th><th>Segment</th><th className="r">Contracts</th>
                  <Th k="aed" r>Invested</Th><Th k="profitPaid" r>Profit paid (AED)</Th><Th k="overdue" r>Overdue (AED)</Th><Th k="next">Next payout</Th><th>KYC</th><th>Salesperson</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const segName = segmentOf(r.aed)
                  return (
                    <tr key={r.inv.id}>
                      <td>
                        <Link to={`/investors/${r.inv.id}`} className="flex items-center gap-2.5 hover:text-gold-600">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gold-100 text-[0.6875rem] font-bold text-gold-600">{r.inv.fullName.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>
                          <span><span className="block font-medium">{r.inv.fullName}</span><span className="text-[0.6875rem] text-muted">{r.inv.id} · {r.inv.city}</span></span>
                        </Link>
                      </td>
                      <td>{ctx.ds.countries.find((c) => c.code === r.inv.country)?.name}</td>
                      <td><Badge tone={segName === 'Platinum' ? 'navy' : segName === 'Gold' ? 'gold' : 'neutral'}>{segName}</Badge></td>
                      <td className="r">{r.active}/{r.contracts}</td>
                      <td className="r font-semibold">
                        {ctx.filters.view === 'AED' ? <>AED {full(r.aed)}</> : moneyEntries({ aed: r.aed, byCur: r.byCur }).map(([c, v]) => <div key={c}>{c} {full(v)}</div>)}
                      </td>
                      <td className="r">{full(r.profitPaid)}</td>
                      <td className={`r ${r.overdue > 0.5 ? 'font-semibold text-bad' : 'text-muted'}`}>{r.overdue > 0.5 ? full(r.overdue) : '—'}</td>
                      <td>{fmtDate(r.next)}</td>
                      <td><StatusBadge s={r.inv.kycStatus} /></td>
                      <td className="text-ink-2">{ctx.salesById.get(r.inv.assignedSalesId)?.name}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableWrap>
          <div className="mt-3 text-xs text-muted">{rows.length} investors · total invested AED {compact(rows.reduce((s, r) => s + r.aed, 0), 2)}</div>
        </div>
      </Card>
    </div>
  )
}
