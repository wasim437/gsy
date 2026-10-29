import { useState } from 'react'
import { CartesianGrid, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import { C, ENTITY_COLOR, Legend, SERIES, SplitBar, axisTick, fmtAxis } from '../../components/charts'
import { Bullet, Heatmap, SeqLegend } from '../../components/advanced'
import { Badge, Card, PageHeader } from '../../components/ui'
import { COUNTRY_TARGETS, salesByMonth } from '../../data/analytics'
import { buildCtx, contractAED, crmCommission, filteredLeads, inMonth, monthsWindow } from '../../data/engine'
import { useStore } from '../../data/store'
import { OPEN_STAGES } from '../../data/types'
import { monthLabel } from '../../lib/dates'
import { compact, full } from '../../lib/format'

const SOURCES = ['Referral', 'Social media', 'Events', 'Freelancer', 'Website'] as const

export default function SalesPerformance() {
  const { ctx, ds, filters, today, user } = useStore()
  const crm = crmCommission(ctx)
  const leads = filteredLeads(ctx)

  // Per-person metrics for radar + scatter
  const people = crm.people.map((p) => {
    const mine = leads.filter((l) => l.salesId === p.sp.id)
    const won = mine.filter((l) => l.stage === 'Funded').length
    const lost = mine.filter((l) => l.stage === 'Lost').length
    const pipe = mine.filter((l) => OPEN_STAGES.includes(l.stage)).reduce((s, l) => s + (l.expectedAmount ? ctx.toAED(l.expectedAmount, l.currency, ctx.ref) : 0), 0)
    return { ...p, winRate: won / Math.max(1, won + lost), pipe, avgDeal: p.deals ? p.raisedAED / p.deals : 0 }
  })
  const [picked, setPicked] = useState<string[]>(() => people.slice(0, 3).map((p) => p.sp.id))
  const metrics = [
    ['Amount raised', (p: (typeof people)[number]) => p.raisedAED],
    ['Deals closed', (p: (typeof people)[number]) => p.deals],
    ['Win rate', (p: (typeof people)[number]) => p.winRate],
    ['Open pipeline', (p: (typeof people)[number]) => p.pipe],
    ['Avg deal size', (p: (typeof people)[number]) => p.avgDeal],
  ] as const
  const maxes = metrics.map(([, f]) => Math.max(1e-9, ...people.map(f)))
  const sel = people.filter((p) => picked.includes(p.sp.id))
  const radar = metrics.map(([name, f], i) => ({ metric: name, ...Object.fromEntries(sel.map((p) => [p.sp.id, Math.round((f(p) / maxes[i]) * 100)])) }))
  const toggle = (id: string) => setPicked((x) => (x.includes(id) ? x.filter((y) => y !== id) : x.length >= 3 ? [...x.slice(1), id] : [...x, id]))

  // Targets: raised this month by country vs target (ignores the country filter so all three show)
  const targets = ds.countries.filter((c) => !user?.countries.length || user.countries.includes(c.code)).map((c) => {
    const cctx = buildCtx(ds, { ...filters, countries: [c.code] }, today)
    const actual = cctx.contracts.filter((x) => inMonth(x.startDate, cctx) && x.startDate <= cctx.ref).reduce((s, x) => s + contractAED(x, cctx), 0)
    return { c, actual, target: COUNTRY_TARGETS[c.code] }
  })

  const months = monthsWindow(ctx, 5)
  const heat = salesByMonth(ctx, months).filter((r) => (!filters.countries.length || filters.countries.includes(r.sp.country)) && (!filters.salesIds.length || filters.salesIds.includes(r.sp.id)))

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Sales Performance" subtitle="Targets, who is performing, how each person compares, and which lead sources bring in money" actions={<Badge tone="gold">Advanced analytics</Badge>} />

      <Card title={`Targets vs actual: ${monthLabel(ctx.filters.month, 'long')}`} subtitle="Bar = raised · gold marker = monthly target · shaded = 75% and 100% bands (sample targets)">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {targets.map((t) => <Bullet key={t.c.code} label={t.c.team} actual={t.actual} target={t.target} />)}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
        <Card className="xl:col-span-2" title="Compare salespeople (radar)" subtitle="Pick up to 3 · each axis scaled to the best performer = 100">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {people.map((p) => {
              const i = picked.indexOf(p.sp.id)
              return (
                <button key={p.sp.id} onClick={() => toggle(p.sp.id)} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${i >= 0 ? 'border-navy-900 bg-navy-900 text-white' : 'border-line hover:border-gold-500'}`}>
                  {i >= 0 && <span className="h-2 w-2 rounded-full" style={{ background: SERIES[i] }} />}
                  {p.sp.name.split(' ')[0]}
                </button>
              )
            })}
          </div>
          <Legend items={sel.map((p) => ({ label: p.sp.name, color: SERIES[picked.indexOf(p.sp.id)] }))} />
          <div className="h-72">
            <ResponsiveContainer>
              <RadarChart data={radar} outerRadius="72%">
                <PolarGrid stroke={C.grid} />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: '#3f4a5e' }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                  <div className="rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-lg"><b>{label}</b>{payload.map((x) => <div key={String(x.dataKey)} className="num">{ctx.salesById.get(String(x.dataKey))?.name}: {x.value}/100</div>)}</div>
                ) : null} />
                {sel.map((p) => {
                  const color = SERIES[picked.indexOf(p.sp.id)]
                  return <Radar key={p.sp.id} dataKey={p.sp.id} name={p.sp.name} stroke={color} strokeWidth={2} fill={color} fillOpacity={0.15} dot={{ r: 3, fill: color }} />
                })}
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="xl:col-span-3" title="Deals vs money raised" subtitle="Each dot is a salesperson · size = open pipeline · top-right = strongest">
          <Legend items={[{ label: 'CRM staff', color: C.c1 }, { label: 'Freelancer', color: C.c2 }]} />
          <div className="h-80">
            <ResponsiveContainer>
              <ScatterChart margin={{ left: -4, right: 16, top: 10, bottom: 4 }}>
                <CartesianGrid stroke={C.grid} />
                <XAxis type="number" dataKey="deals" name="Deals" allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} label={{ value: 'Deals closed', position: 'insideBottom', offset: -2, fontSize: 10, fill: C.axis }} height={36} />
                <YAxis type="number" dataKey="raisedAED" name="Raised" tickFormatter={fmtAxis} tick={axisTick} axisLine={false} tickLine={false} width={52} />
                <ZAxis type="number" dataKey="pipe" range={[60, 900]} />
                <Tooltip content={({ active, payload }) => active && payload?.length ? (
                  <div className="rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-lg">
                    <b>{payload[0].payload.sp.name}</b> <span className="text-muted">({payload[0].payload.sp.type})</span>
                    <div className="num">Raised AED {full(payload[0].payload.raisedAED)}</div>
                    <div>{payload[0].payload.deals} deals · win rate {Math.round(payload[0].payload.winRate * 100)}%</div>
                    <div className="num">Pipeline AED {compact(payload[0].payload.pipe, 1)}</div>
                  </div>
                ) : null} />
                <Scatter name="CRM staff" data={people.filter((p) => p.sp.type === 'CRM Staff')} fill={C.c1} fillOpacity={0.75} stroke="#fff" strokeWidth={1.5} />
                <Scatter name="Freelancer" data={people.filter((p) => p.sp.type === 'Freelancer')} fill={C.c2} fillOpacity={0.75} stroke="#fff" strokeWidth={1.5} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
        <Card className="xl:col-span-3" title="Money raised: salesperson × month" subtitle="AED · last 6 months · spot who is consistent and who has gone quiet" action={<SeqLegend label="" min="less" max="more" />}>
          <Heatmap
            cols={months.map((m) => monthLabel(m))}
            rows={heat.map((r) => ({ label: <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: ENTITY_COLOR[r.sp.country] }} />{r.sp.name}</span>, cells: r.cells }))}
          />
        </Card>
        <Card className="xl:col-span-2" title="Lead source mix by country" subtitle="Where each team’s leads come from">
          <div className="flex flex-col gap-5">
            {ds.countries.map((c) => {
              const mine = leads.filter((l) => ctx.salesById.get(l.salesId)?.country === c.code)
              return (
                <div key={c.code}>
                  <div className="mb-1.5 text-xs font-semibold text-ink-2">{c.name} <span className="font-normal text-muted">· {mine.length} leads</span></div>
                  <SplitBar parts={SOURCES.map((s, i) => ({ label: s, value: mine.filter((l) => l.source === s).length, color: SERIES[i] }))} />
                </div>
              )
            })}
          </div>
        </Card>
      </div>
    </div>
  )
}
