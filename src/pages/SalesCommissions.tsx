import { Trophy } from 'lucide-react'
import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { C, Legend, Tip, axisTick, fmtAxis } from '../components/charts'
import { Badge, Card, Kpi, PageHeader, TableWrap } from '../components/ui'
import { crmCommission } from '../data/engine'
import { useStore } from '../data/store'
import { CURRENCIES } from '../data/types'
import { compact, full, pct } from '../lib/format'

export default function SalesCommissions() {
  const { ctx } = useStore()
  const crm = crmCommission(ctx)
  const [type, setType] = useState<'All' | 'CRM Staff' | 'Freelancer'>('All')
  const people = crm.people.filter((p) => type === 'All' || p.sp.type === type)
  const payable = crm.people.filter((p) => p.payable > 0.5).sort((a, b) => b.payable - a.payable)
  const chart = people.map((p) => ({ name: p.sp.name.split(' ')[0], Paid: Math.round(p.paid), Payable: Math.round(Math.max(0, p.payable)), 'Can still earn': Math.round(p.toEarn) }))

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="CRM & Freelancer Commissions" subtitle="Every salesperson: what they raised, what they earned, what has been paid and what is still payable" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <Kpi label="Earned to date" accent="gold"><Big v={crm.earned} /></Kpi>
        <Kpi label="Paid"><Big v={crm.paid} cls="text-good" /></Kpi>
        <Kpi label="Payable now" accent="bad" sub={`${payable.length} people waiting`}><Big v={crm.payable} cls="text-warn" /></Kpi>
        <Kpi label="Can still earn" sub="Monthly commission on active contracts"><Big v={crm.toEarn} /></Kpi>
        <Kpi label="Potential from pipeline" sub="Open deals × commission %"><Big v={crm.potential} /></Kpi>
      </div>

      <Card title="Paid, payable and still to earn" subtitle="Per person · AED" action={
        <div className="flex gap-1 rounded-xl bg-page p-1">
          {(['All', 'CRM Staff', 'Freelancer'] as const).map((t) => (
            <button key={t} onClick={() => setType(t)} className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${type === t ? 'bg-navy-900 text-white' : 'text-muted'}`}>{t}</button>
          ))}
        </div>
      }>
        <Legend items={[{ label: 'Paid', color: C.c1 }, { label: 'Payable', color: C.c4 }, { label: 'Can still earn', color: C.c2 }]} />
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={chart} margin={{ left: -8, right: 4, top: 4 }}>
              <CartesianGrid vertical={false} stroke={C.grid} />
              <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} interval={0} />
              <YAxis tickFormatter={fmtAxis} tick={axisTick} axisLine={false} tickLine={false} width={48} />
              <Tooltip cursor={{ fill: 'rgba(201,162,77,0.08)' }} content={<Tip />} />
              <Bar dataKey="Paid" stackId="a" fill={C.c1} maxBarSize={34} stroke="#fff" strokeWidth={1} />
              <Bar dataKey="Payable" stackId="a" fill={C.c4} maxBarSize={34} stroke="#fff" strokeWidth={1} />
              <Bar dataKey="Can still earn" stackId="a" fill={C.c2} radius={[4, 4, 0, 0]} maxBarSize={34} stroke="#fff" strokeWidth={1} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Leaderboard" subtitle="Ranked by amount raised · amounts in AED unless shown in original currency">
        <TableWrap max="max-h-[560px]">
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th><th>Name</th><th>Type</th><th>Country</th><th className="r">Deals</th>
                {CURRENCIES.map((c) => <th key={c} className="r">Raised {c}</th>)}
                <th className="r">Raised AED</th><th className="r">%</th><th>Method</th><th className="r">Earned</th><th className="r">Paid</th><th className="r">Payable</th><th className="r">Can still earn</th><th className="r">Potential</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p, i) => (
                <tr key={p.sp.id}>
                  <td>{i < 3 ? <Trophy size={14} className={i === 0 ? 'text-gold-500' : 'text-muted'} /> : <span className="text-muted">{i + 1}</span>}</td>
                  <td className="font-medium">{p.sp.name}</td>
                  <td><Badge tone={p.sp.type === 'Freelancer' ? 'gold' : 'info'}>{p.sp.type}</Badge></td>
                  <td>{ctx.ds.countries.find((c) => c.code === p.sp.country)?.name}</td>
                  <td className="r">{p.deals}</td>
                  {CURRENCIES.map((c) => <td key={c} className="r text-ink-2">{p.raised[c] ? compact(p.raised[c]!, 1) : '—'}</td>)}
                  <td className="r font-semibold">{compact(p.raisedAED, 2)}</td>
                  <td className="r">{pct(p.sp.commissionPct, 2)}</td>
                  <td>{p.sp.paymentMethod}</td>
                  <td className="r">{full(p.earned)}</td>
                  <td className="r text-good">{full(p.paid)}</td>
                  <td className={`r ${p.payable > 0.5 ? 'font-semibold text-warn' : 'text-muted'}`}>{full(Math.max(0, p.payable))}</td>
                  <td className="r">{full(p.toEarn)}</td>
                  <td className="r">{full(p.potential)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      <Card title="Payable list for Finance" subtitle="Commission earned but not yet paid · AED">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {payable.map((p) => (
            <div key={p.sp.id} className="flex items-center justify-between rounded-xl border border-line px-3.5 py-2.5">
              <div>
                <div className="text-sm font-medium">{p.sp.name}</div>
                <div className="text-xs text-muted">{p.sp.type} · {p.sp.paymentMethod}</div>
              </div>
              <div className="num text-right font-semibold text-warn">AED {full(p.payable)}</div>
            </div>
          ))}
          {!payable.length && <div className="text-sm text-muted">Nothing payable.</div>}
        </div>
      </Card>
    </div>
  )
}

function Big({ v, cls = '' }: { v: number; cls?: string }) {
  return <span className={`num text-2xl font-semibold ${cls}`}><span className="mr-1 text-xs text-muted">AED</span>{compact(v, 2)}</span>
}
