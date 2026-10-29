import { RotateCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Area, Bar, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { C, Legend, Tip, axisTick, fmtAxis } from '../../components/charts'
import { Gauge, SeqLegend, Slider, seq } from '../../components/advanced'
import { Badge, Card, Kpi, PageHeader } from '../../components/ui'
import { BASE_STRESS, cashRunway, dailyDue, type StressParams } from '../../data/analytics'
import { liquidity } from '../../data/engine'
import { useStore } from '../../data/store'
import { addDays, fmtDate, monthLabel, parseISO } from '../../lib/dates'
import { compact, full } from '../../lib/format'

const PRESETS: { name: string; p: StressParams }[] = [
  { name: 'Base case', p: BASE_STRESS },
  { name: 'Sales slowdown', p: { ...BASE_STRESS, salesDropPct: 40 } },
  { name: 'Mass withdrawal', p: { ...BASE_STRESS, nonRenewPct: 80 } },
  { name: 'Severe (all)', p: { nonRenewPct: 80, salesDropPct: 50, fxPct: 10, subReturnPct: 0.8 } },
]

export default function StressTest() {
  const { ctx } = useStore()
  const [p, setP] = useState<StressParams>(BASE_STRESS)
  const base = useMemo(() => cashRunway(ctx, BASE_STRESS), [ctx])
  const sim = useMemo(() => cashRunway(ctx, p), [ctx, p])
  const liq = liquidity(ctx)
  const series = sim.rows.map((r, i) => ({ ...r, base: base.rows[i].balance, stressed: r.balance }))
  const set = (k: keyof StressParams) => (v: number) => setP({ ...p, [k]: v })

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Stress Test & Cash Calendar" subtitle="What happens to GSY’s cash if investors withdraw, sales slow down or currencies move? Move the sliders to see it live." actions={<Badge tone="gold">Advanced analytics</Badge>} />

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
        <Card title="Scenario" subtitle="Drag to stress the forecast" action={<button onClick={() => setP(BASE_STRESS)} className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink"><RotateCcw size={13} /> Reset</button>}>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {PRESETS.map((x) => (
              <button key={x.name} onClick={() => setP(x.p)} className={`rounded-full border px-2.5 py-1 text-xs ${JSON.stringify(p) === JSON.stringify(x.p) ? 'border-navy-900 bg-navy-900 text-white' : 'border-line hover:border-gold-500'}`}>{x.name}</button>
            ))}
          </div>
          <div className="flex flex-col gap-4">
            <Slider label="Investors who don’t renew" value={p.nonRenewPct} min={0} max={100} step={5} onChange={set('nonRenewPct')} hint="Share of maturing capital paid back in cash" />
            <Slider label="Drop in new sales" value={p.salesDropPct} min={0} max={100} step={5} onChange={set('salesDropPct')} hint={`Base: AED ${compact(base.avgNew, 2)} new money / month`} />
            <Slider label="FX move (INR / MYR / SGD)" value={p.fxPct} min={-20} max={20} step={1} onChange={set('fxPct')} hint="+ means foreign payouts cost more AED" />
            <Slider label="Cash back from sub-companies" value={p.subReturnPct} min={0} max={4} step={0.1} onChange={set('subReturnPct')} hint="% per month of net internal investment" />
          </div>
        </Card>

        <div className="flex flex-col gap-3 xl:col-span-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Kpi label="Lowest cash in 12 months" accent={sim.low.balance < 0 ? 'bad' : 'good'} sub={`in ${monthLabel(sim.low.month, 'long')}`}>
              <span className={`num text-2xl font-semibold ${sim.low.balance < 0 ? 'text-bad' : ''}`}><span className="mr-1 text-xs text-muted">AED</span>{compact(sim.low.balance, 2)}</span>
            </Kpi>
            <Kpi label="Cash runs out" accent={sim.firstNegative ? 'bad' : 'good'} sub={sim.firstNegative ? 'Action needed before this month' : 'Cash stays positive for 12 months'}>
              <span className={`text-2xl font-semibold ${sim.firstNegative ? 'text-bad' : 'text-good'}`}>{sim.firstNegative ? monthLabel(sim.firstNegative, 'long') : 'Not in 12 mo'}</span>
            </Kpi>
            <Kpi label="Cash in 12 months vs base" sub={`Base: AED ${compact(base.rows[11].balance, 2)}`}>
              <span className={`num text-2xl font-semibold ${sim.rows[11].balance - base.rows[11].balance < 0 ? 'text-bad' : 'text-good'}`}>{sim.rows[11].balance - base.rows[11].balance < 0 ? '−' : '+'}{compact(Math.abs(sim.rows[11].balance - base.rows[11].balance), 2)}</span>
            </Kpi>
          </div>
          <Card title="Cash balance: base vs your scenario" subtitle={`Starts from today’s bank balance of AED ${compact(sim.opening, 2)}`}>
            <Legend items={[{ label: 'Base case', color: C.c1, dash: true }, { label: 'Your scenario', color: C.c4, dash: true }]} />
            <div className="h-64">
              <ResponsiveContainer>
                <LineChart data={series} margin={{ left: -4, right: 8, top: 6 }}>
                  <CartesianGrid vertical={false} stroke={C.grid} />
                  <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m)} tick={axisTick} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={fmtAxis} tick={axisTick} axisLine={false} tickLine={false} width={52} />
                  <ReferenceLine y={0} stroke={C.bad} strokeDasharray="4 3" label={{ value: 'Zero cash', fontSize: 10, fill: C.bad, position: 'insideBottomRight' }} />
                  <Tooltip content={<Tip labelFmt={(l) => monthLabel(String(l), 'long')} />} />
                  <Line dataKey="base" name="Base case" stroke={C.c1} strokeWidth={2} strokeDasharray="5 4" dot={false} />
                  <Line dataKey="stressed" name="Your scenario" stroke={C.c4} strokeWidth={2.5} dot={{ r: 3, fill: '#fff', strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Card title="Liquidity cover" subtitle="Bank balance ÷ obligations in the next 90 days">
          <div className="flex flex-col items-center">
            <Gauge value={liq.ratio} label="Liquidity cover" />
            <div className="mt-2 grid w-full grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-page px-3 py-2"><div className="text-muted">Cash</div><div className="num font-semibold">AED {compact(liq.cash, 2)}</div></div>
              <div className="rounded-lg bg-page px-3 py-2"><div className="text-muted">Due 90 days</div><div className="num font-semibold">AED {compact(liq.obligations, 2)}</div></div>
            </div>
            <div className="mt-3 flex gap-2 text-[0.6875rem]"><Badge tone="bad">&lt;1.2× danger</Badge><Badge tone="warn">1.2–1.5× watch</Badge><Badge tone="good">&gt;1.5× safe</Badge></div>
          </div>
        </Card>
        <Card className="xl:col-span-2" title="Monthly cash in vs out (your scenario)" subtitle="AED · outflow split into profit, capital returned and running costs">
          <Legend items={[{ label: 'Profit', color: C.c1 }, { label: 'Capital returned', color: C.c2 }, { label: 'Costs + commission', color: C.c5 }, { label: 'Cash in', color: C.c3, dash: true }]} />
          <div className="h-60">
            <ResponsiveContainer>
              <ComposedChart data={sim.rows} margin={{ left: -4, right: 8, top: 6 }}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m)} tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtAxis} tick={axisTick} axisLine={false} tickLine={false} width={52} />
                <Tooltip cursor={{ fill: 'rgba(201,162,77,0.08)' }} content={<Tip labelFmt={(l) => monthLabel(String(l), 'long')} />} />
                <Bar dataKey="profit" name="Profit" stackId="o" fill={C.c1} maxBarSize={26} stroke="#fff" strokeWidth={1} />
                <Bar dataKey="capital" name="Capital returned" stackId="o" fill={C.c2} maxBarSize={26} stroke="#fff" strokeWidth={1} />
                <Bar dataKey="other" name="Costs + commission" stackId="o" fill={C.c5} radius={[4, 4, 0, 0]} maxBarSize={26} stroke="#fff" strokeWidth={1} />
                <Area dataKey="inflow" name="Cash in" stroke={C.c3} strokeWidth={2} fill={C.c3} fillOpacity={0.08} type="monotone" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <PayoutCalendar />
    </div>
  )
}

function PayoutCalendar() {
  const { ctx } = useStore()
  const [hover, setHover] = useState<string | null>(null)
  // 26 weeks: 8 back, 18 ahead, starting on a Monday
  const t = parseISO(ctx.ref)
  const dow = (t.getUTCDay() + 6) % 7
  const start = addDays(ctx.ref, -dow - 7 * 8)
  const end = addDays(start, 26 * 7 - 1)
  const due = dailyDue(ctx, start, end)
  const max = Math.max(1, ...[...due.values()].map((d) => d.due))
  const weeks = Array.from({ length: 26 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)))
  const h = hover ? due.get(hover) : null
  const busiest = [...due.entries()].filter(([d]) => d > ctx.ref).sort((a, b) => b[1].due - a[1].due).slice(0, 5)

  return (
    <Card title="Payout calendar" subtitle="Each square is one day; darker = more money due. Red outline = still unpaid after the due date." action={<SeqLegend label="AED due" max={compact(max, 1)} />}>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_260px]">
        <div className="scroll-thin overflow-x-auto">
          <div className="inline-flex gap-[3px]">
            <div className="mr-1 flex flex-col gap-[3px] pt-5 text-[0.625rem] text-muted">
              {['Mon', '', 'Wed', '', 'Fri', '', 'Sun'].map((d, i) => <div key={i} className="h-[18px] leading-[18px]">{d}</div>)}
            </div>
            {weeks.map((wk, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                <div className="h-4 text-[0.625rem] whitespace-nowrap text-muted">{parseISO(wk[0]).getUTCDate() <= 7 ? monthLabel(wk[0].slice(0, 7)).split(' ')[0] : ''}</div>
                {wk.map((d) => {
                  const v = due.get(d)
                  const late = v && d < ctx.ref && v.remaining > 0.5
                  return (
                    <div
                      key={d}
                      onMouseEnter={() => setHover(d)}
                      onMouseLeave={() => setHover(null)}
                      title={`${fmtDate(d)} · AED ${full(v?.due ?? 0)}`}
                      className={`h-[18px] w-[18px] rounded-[4px] ${d === ctx.ref ? 'ring-2 ring-gold-500 ring-offset-1' : ''} ${late ? 'outline-2 outline-bad' : ''}`}
                      style={{ background: v ? seq(0.12 + 0.88 * (v.due / max)) : d < ctx.ref ? '#f0ede5' : '#f7f5f0' }}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div className="rounded-xl bg-navy-900 p-3 text-white">
            <div className="text-[0.6875rem] text-white/60">{hover ? fmtDate(hover) : 'Hover a day'}</div>
            <div className="num text-xl font-semibold">AED {full(h?.due ?? 0)}</div>
            <div className="text-[0.6875rem] text-white/60">{h ? `${h.n} payments${h.remaining > 0.5 ? ` · AED ${full(h.remaining)} unpaid` : ''}` : 'scheduled payouts'}</div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-semibold text-muted">Heaviest days ahead</div>
            {busiest.map(([d, v]) => (
              <div key={d} className="flex justify-between border-b border-line-2 py-1.5 text-xs"><span>{fmtDate(d)}</span><span className="num font-semibold">AED {compact(v.due, 2)}</span></div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}
