import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import { C, ENTITY_COLOR, Legend, Tip, axisTick, fmtAxis } from '../../components/charts'
import { Heatmap, SeqLegend } from '../../components/advanced'
import { Badge, Card, PageHeader } from '../../components/ui'
import { SIZE_BINS, aumByProduct, investorBubbles, punctuality, vintage } from '../../data/analytics'
import { contractAED, isActive, monthsWindow } from '../../data/engine'
import { useStore } from '../../data/store'
import { addMonthKey, daysBetween, fmtDate, monthKey, monthLabel, parseISO } from '../../lib/dates'
import { compact, full } from '../../lib/format'

export default function Portfolio() {
  const { ctx, ds } = useStore()
  const months = monthsWindow(ctx, 23, 12)
  const aum = aumByProduct(ctx, months)
  const vin = vintage(ctx, monthsWindow(ctx, 11))
  const punct = punctuality(ctx, monthsWindow(ctx, 11))
  const bubbles = investorBubbles(ctx)
  const active = ctx.contracts.filter((c) => isActive(c, ctx.ref))
  const hist = SIZE_BINS.map(([label, lo, hi]) => {
    const rows = active.filter((c) => { const v = contractAED(c, ctx); return v >= lo && v < hi })
    return { label, count: rows.length, capital: Math.round(rows.reduce((s, c) => s + contractAED(c, ctx), 0)) }
  })

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Portfolio Analytics" subtitle="How the book has grown, when money is due back, and where the risk sits" actions={<Badge tone="gold">Advanced analytics</Badge>} />

      <Card title="Active capital over time, by product" subtitle="AED at each month end · right of the line = projected run-off if no new money comes in">
        <Legend items={ds.products.map((p) => ({ label: p.name, color: ENTITY_COLOR[p.id] }))} />
        <div className="h-72">
          <ResponsiveContainer>
            <AreaChart data={aum} margin={{ left: -4, right: 8, top: 6 }}>
              <CartesianGrid vertical={false} stroke={C.grid} />
              <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m)} tick={axisTick} axisLine={false} tickLine={false} minTickGap={18} />
              <YAxis tickFormatter={fmtAxis} tick={axisTick} axisLine={false} tickLine={false} width={52} />
              <Tooltip content={<Tip labelFmt={(l) => monthLabel(String(l), 'long')} />} />
              <ReferenceLine x={ctx.filters.month} stroke="#0f1d33" strokeDasharray="4 3" label={{ value: 'Today', fontSize: 10, fill: '#0f1d33', position: 'top' }} />
              {ds.products.map((p) => (
                <Area key={p.id} type="monotone" dataKey={p.id} name={p.name} stackId="1" stroke="#fff" strokeWidth={1.5} fill={ENTITY_COLOR[p.id]} fillOpacity={0.9} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <MaturityTimeline />

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Card title="Investor risk map (bubble)" subtitle="Each bubble is an investor · up = more capital · left = money due back sooner · size = monthly profit">
          <Legend items={ds.countries.map((c) => ({ label: c.name, color: ENTITY_COLOR[c.code] }))} />
          <div className="h-80">
            <ResponsiveContainer>
              <ScatterChart margin={{ left: -4, right: 12, top: 10, bottom: 4 }}>
                <CartesianGrid stroke={C.grid} />
                <XAxis type="number" dataKey="months" name="Months to maturity" tick={axisTick} axisLine={false} tickLine={false} label={{ value: 'Months until next maturity', position: 'insideBottom', offset: -2, fontSize: 10, fill: C.axis }} height={36} />
                <YAxis type="number" dataKey="capital" name="Capital" tickFormatter={fmtAxis} tick={axisTick} axisLine={false} tickLine={false} width={52} />
                <ZAxis type="number" dataKey="profit" range={[40, 700]} />
                <ReferenceLine x={3} stroke={C.bad} strokeDasharray="4 3" label={{ value: '3 months', fontSize: 10, fill: C.bad, position: 'top' }} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active: a, payload }) => a && payload?.length ? (
                  <div className="rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-lg">
                    <b>{payload[0].payload.name}</b>
                    <div className="num">Capital AED {full(payload[0].payload.capital)}</div>
                    <div className="num">Profit AED {full(payload[0].payload.profit)} / month</div>
                    <div>Next maturity in {payload[0].payload.months} months</div>
                  </div>
                ) : null} />
                {ds.countries.map((c) => (
                  <Scatter key={c.code} name={c.name} data={bubbles.filter((b) => b.country === c.code)} fill={ENTITY_COLOR[c.code]} fillOpacity={0.7} stroke="#fff" strokeWidth={1.5} />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Contract size distribution" subtitle="Number of active contracts by size (AED) · hover for capital in each band">
          <div className="h-80">
            <ResponsiveContainer>
              <BarChart data={hist} margin={{ left: -12, right: 8, top: 10 }}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} width={40} />
                <Tooltip cursor={{ fill: 'rgba(201,162,77,0.08)' }} content={({ active: a, payload }) => a && payload?.length ? (
                  <div className="rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-lg"><b>{payload[0].payload.label}</b><div>{payload[0].payload.count} contracts</div><div className="num">AED {full(payload[0].payload.capital)}</div></div>
                ) : null} />
                <Bar dataKey="count" name="Contracts" fill={C.c1} radius={[4, 4, 0, 0]} maxBarSize={56} label={{ position: 'top', fontSize: 11, fill: '#3f4a5e' }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
        <Card className="xl:col-span-3" title="Investment vintage" subtitle="Capital raised per month × product (AED)" action={<SeqLegend label="" max="more" min="less" />}>
          <Heatmap cols={ds.products.map((p) => p.name)} rows={vin.map((v) => ({ label: monthLabel(v.month, 'long'), cells: v.cells }))} />
        </Card>
        <Card className="xl:col-span-2" title="Payout punctuality" subtitle="% of payouts paid within 2 days of the due date">
          <Heatmap
            cols={ds.companies.filter((c) => c.type === 'Investment Co').map((c) => c.name.replace('Investment ', ''))}
            rows={punct.map((v) => ({ label: monthLabel(v.month, 'long'), cells: v.cells.map((x) => (x === null ? null : x)) }))}
            max={1}
            fmt={(v) => `${Math.round(v * 100)}%`}
          />
        </Card>
      </div>
    </div>
  )
}

/** Gantt-style timeline: each active contract as a bar from start to maturity. */
function MaturityTimeline() {
  const { ctx } = useStore()
  const [sort, setSort] = useState<'soon' | 'large'>('soon')
  const rows = ctx.contracts
    .filter((c) => isActive(c, ctx.ref))
    .sort((a, b) => (sort === 'soon' ? a.endDate.localeCompare(b.endDate) : contractAED(b, ctx) - contractAED(a, ctx)))
    .slice(0, 24)
  if (!rows.length) return null
  const min = rows.reduce((m, c) => (c.startDate < m ? c.startDate : m), rows[0].startDate)
  const max = rows.reduce((m, c) => (c.endDate > m ? c.endDate : m), rows[0].endDate)
  const span = Math.max(1, daysBetween(min, max))
  const x = (d: string) => (daysBetween(min, d) / span) * 100
  const ticks: string[] = []
  for (let k = monthKey(min); k <= monthKey(max); k = addMonthKey(k, 3)) ticks.push(k + '-01')

  return (
    <Card title="Maturity timeline" subtitle="Each bar is a contract from start to maturity · colour = product · capital is returned at the right end" action={
      <div className="flex gap-1 rounded-xl bg-page p-1">
        {([['soon', 'Maturing soon'], ['large', 'Largest']] as const).map(([id, l]) => <button key={id} onClick={() => setSort(id)} className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${sort === id ? 'bg-navy-900 text-white' : 'text-muted'}`}>{l}</button>)}
      </div>
    }>
      <Legend items={ctx.ds.products.map((p) => ({ label: p.name, color: ENTITY_COLOR[p.id] }))} />
      <div className="scroll-thin overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="relative ml-44 h-5 border-b border-line text-[0.625rem] text-muted">
            {ticks.map((t) => x(t) >= 0 && x(t) <= 100 && <span key={t} className="absolute -translate-x-1/2" style={{ left: `${x(t)}%` }}>{monthLabel(t.slice(0, 7))}</span>)}
          </div>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 z-10 w-px bg-navy-900" style={{ left: `calc(11rem + (100% - 11rem) * ${x(ctx.ref) / 100})` }}>
              <span className="absolute -top-0.5 left-1 rounded bg-navy-900 px-1 text-[0.5625rem] text-white">Today</span>
            </div>
            {rows.map((c) => {
              const inv = ctx.investorById.get(c.investorId)!
              const soon = daysBetween(ctx.ref, c.endDate) <= 90
              return (
                <div key={c.id} className="group flex h-7 items-center">
                  <Link to={`/investors/${inv.id}`} className="w-44 shrink-0 truncate pr-3 text-xs hover:text-gold-600">
                    <span className="font-medium">{inv.fullName}</span> <span className="text-muted">{c.id}</span>
                  </Link>
                  <div className="relative h-full flex-1 border-l border-line-2">
                    {ticks.map((t) => <div key={t} className="absolute inset-y-0 w-px bg-line-2" style={{ left: `${x(t)}%` }} />)}
                    <div
                      className="absolute top-1.5 flex h-4 items-center justify-end rounded-[4px] pr-1 transition group-hover:brightness-110"
                      style={{ left: `${x(c.startDate)}%`, width: `${x(c.endDate) - x(c.startDate)}%`, background: ENTITY_COLOR[c.productId] }}
                      title={`${inv.fullName} · ${c.currency} ${full(c.amount)} · ${fmtDate(c.startDate)} → ${fmtDate(c.endDate)}`}
                    >
                      <span className="num text-[0.625rem] font-semibold text-white">{compact(contractAED(c, ctx), 1)}</span>
                    </div>
                    <div className={`absolute top-1 h-5 w-1.5 rounded-sm ${soon ? 'bg-bad' : 'bg-navy-900'}`} style={{ left: `calc(${x(c.endDate)}% - 3px)` }} title={`Capital back ${fmtDate(c.endDate)}`} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <div className="mt-2 text-[0.6875rem] text-muted">Red end-marker = matures within 90 days. Showing 24 of {ctx.contracts.filter((c) => isActive(c, ctx.ref)).length} active contracts · range {parseISO(min).getUTCFullYear()}–{parseISO(max).getUTCFullYear()}.</div>
    </Card>
  )
}
