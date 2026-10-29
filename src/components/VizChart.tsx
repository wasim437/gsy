/* Renders any VizSpec. Shared by the Report Builder, pinned reports and AI assistant answers. */
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, Treemap, XAxis, YAxis } from 'recharts'
import { useMemo } from 'react'
import { buildCtx } from '../data/engine'
import { useStore } from '../data/store'
import { pivot, type Pivot, type VizSpec } from '../data/explore'
import { compact, full } from '../lib/format'
import { BarList, C, Legend, axisTick } from './charts'

export function usePivot(spec: VizSpec): Pivot {
  const { ctx, ds, filters, today, user } = useStore()
  const scoped = useMemo(() => {
    if (!spec.countries?.length) return ctx
    // Never widen access: a country-limited user only ever gets their own countries.
    const allowed = user?.countries.length ? spec.countries.filter((c) => user.countries.includes(c as never)) : spec.countries
    return buildCtx(ds, { ...filters, countries: allowed.length ? allowed : ['__none__'] }, today)
  }, [spec.countries, ctx, ds, filters, today, user])
  return pivot(scoped, spec)
}

const fmtV = (p: Pivot, spec: VizSpec) => (v: number) => (spec.pctOfTotal ? `${v.toFixed(1)}%` : p.unit === 'count' ? full(v) : compact(v, 1))

function SeriesTip({ active, payload, label, p, spec }: { active?: boolean; payload?: { name?: string; value?: number; color?: string; fill?: string; stroke?: string }[]; label?: string; p: Pivot; spec: VizSpec }) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((a, x) => a + Number(x.value ?? 0), 0)
  const f = (v: number) => (spec.pctOfTotal ? `${v.toFixed(1)}%` : p.unit === 'count' ? full(v) : `AED ${full(v)}`)
  return (
    <div className="rounded-xl border border-line bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      <div className="mb-1 font-semibold">{label}</div>
      {[...payload].reverse().map((x, i) => (
        <div key={i} className="flex justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-ink-2"><span className="h-2 w-2 rounded-sm" style={{ background: x.color || x.fill || x.stroke }} />{x.name}</span>
          <span className="num font-semibold">{f(Number(x.value ?? 0))}</span>
        </div>
      ))}
      {payload.length > 1 && !spec.pctOfTotal && <div className="mt-1 flex justify-between border-t border-line-2 pt-1 font-semibold"><span>Total</span><span className="num">{f(total)}</span></div>}
    </div>
  )
}

export default function VizChart({ spec, height = 280 }: { spec: VizSpec; height?: number }) {
  const p = usePivot(spec)
  const fmt = fmtV(p, spec)
  const multi = p.series.length > 1
  const legend = multi ? <Legend items={p.series.map((s) => ({ label: s.label, color: s.color, dash: spec.chart === 'line' }))} /> : null
  // Recharts only finds axes among direct children (not inside fragments), so pass an array.
  const axes = [
    <CartesianGrid key="grid" vertical={false} stroke={C.grid} />,
    <XAxis key="x" dataKey="label" tick={axisTick} axisLine={false} tickLine={false} minTickGap={12} />,
    <YAxis key="y" tickFormatter={(v) => fmt(v)} tick={axisTick} axisLine={false} tickLine={false} width={52} />,
    <Tooltip key="tip" cursor={{ fill: 'rgba(201,162,77,0.08)' }} content={<SeriesTip p={p} spec={spec} />} />,
  ]

  if (!p.grand && spec.chart !== 'table') return <div className="grid place-items-center rounded-xl border border-dashed border-line text-sm text-muted" style={{ height }}>No data for this selection</div>

  switch (spec.chart) {
    case 'kpi': {
      const vals = p.rows.map((r) => p.series.reduce((a, s) => a + (r[s.key] as number), 0))
      const lastV = vals[vals.length - 1] ?? 0
      const prev = vals[vals.length - 2] ?? 0
      const ch = prev ? (lastV - prev) / prev : 0
      const max = Math.max(1, ...vals)
      return (
        <div className="flex flex-col gap-3">
          <div className="flex items-end gap-3">
            <div className="num text-4xl font-semibold">{p.unit === 'AED' && !spec.pctOfTotal && <span className="mr-1 text-base text-muted">AED</span>}{p.unit === 'count' ? full(p.grand) : compact(p.grand, 2)}</div>
            {vals.length > 1 && <span className={`mb-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${ch >= 0 ? 'bg-good-bg text-good' : 'bg-bad-bg text-bad'}`}>{ch >= 0 ? '▲' : '▼'} {Math.abs(ch * 100).toFixed(0)}% vs previous</span>}
          </div>
          <div className="flex h-16 items-end gap-1">
            {vals.map((v, i) => <div key={i} title={`${p.rows[i].label}: ${fmt(v)}`} className="flex-1 rounded-t-[3px]" style={{ height: `${Math.max(3, (v / max) * 100)}%`, background: i === vals.length - 1 ? C.c2 : C.c1, opacity: i === vals.length - 1 ? 1 : 0.55 }} />)}
          </div>
          <div className="flex justify-between text-[0.6875rem] text-muted"><span>{p.rows[0]?.label}</span><span>{p.rows[p.rows.length - 1]?.label}</span></div>
        </div>
      )
    }
    case 'bar':
      return <BarList rows={p.totals.map((t) => ({ key: t.key, label: t.label, value: t.value, color: t.color, sub: `${((t.value / (p.grand || 1)) * 100).toFixed(1)}% of total` }))} format={(v) => (p.unit === 'count' ? full(v) : `AED ${compact(v, 2)}`)} />
    case 'donut':
      return (
        <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[1fr_1fr]">
          <div style={{ height }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={p.totals} dataKey="value" nameKey="label" innerRadius="58%" outerRadius="88%" paddingAngle={1.5} stroke="#fff" strokeWidth={2}>
                  {p.totals.map((t) => <Cell key={t.key} fill={t.color} />)}
                </Pie>
                <Tooltip content={({ active, payload }) => active && payload?.length ? <div className="rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-lg"><b>{payload[0].name}</b><div className="num">{p.unit === 'count' ? full(Number(payload[0].value)) : `AED ${full(Number(payload[0].value))}`} · {((Number(payload[0].value) / p.grand) * 100).toFixed(1)}%</div></div> : null} />
                <text x="50%" y="47%" textAnchor="middle" fontSize={11} fill="#6b7486">Total</text>
                <text x="50%" y="56%" textAnchor="middle" fontSize={17} fontWeight={700} fill="#14213a">{p.unit === 'count' ? full(p.grand) : compact(p.grand, 1)}</text>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-2">
            {p.totals.map((t) => (
              <div key={t.key} className="flex items-center justify-between gap-3 text-xs">
                <span className="inline-flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: t.color }} /><span className="truncate">{t.label}</span></span>
                <span className="num shrink-0 font-semibold">{((t.value / (p.grand || 1)) * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )
    case 'treemap':
      return (
        <div style={{ height }}>
          <ResponsiveContainer>
            <Treemap data={p.totals.map((t) => ({ name: t.label, size: Math.max(0, t.value), color: t.color }))} dataKey="size" isAnimationActive={false} content={<Tile />}>
              <Tooltip content={({ active, payload }) => active && payload?.length ? <div className="rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-lg"><b>{payload[0].payload.name}</b><div className="num">{fmt(Number(payload[0].value))}</div></div> : null} />
            </Treemap>
          </ResponsiveContainer>
        </div>
      )
    case 'table':
      return (
        <div className="scroll-thin overflow-auto" style={{ maxHeight: height + 80 }}>
          <table className="tbl">
            <thead><tr><th>Period</th>{p.series.map((s) => <th key={s.key} className="r">{s.label}</th>)}<th className="r">Total</th></tr></thead>
            <tbody>
              {p.rows.map((r) => (
                <tr key={String(r.bucket)}>
                  <td className="font-medium">{r.label}</td>
                  {p.series.map((s) => <td key={s.key} className="r">{spec.pctOfTotal ? `${(r[s.key] as number).toFixed(1)}%` : full(r[s.key] as number)}</td>)}
                  <td className="r font-semibold">{spec.pctOfTotal ? '100%' : full(p.series.reduce((a, s) => a + (r[s.key] as number), 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'line':
      return (
        <div>
          {legend}
          <div style={{ height }}>
            <ResponsiveContainer>
              <LineChart data={p.rows} margin={{ left: -4, right: 8, top: 6 }}>
                {axes}
                {p.series.map((s) => <Line key={s.key} dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={{ r: 3, fill: '#fff', strokeWidth: 2 }} activeDot={{ r: 5 }} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )
    case 'area':
      return (
        <div>
          {legend}
          <div style={{ height }}>
            <ResponsiveContainer>
              <AreaChart data={p.rows} margin={{ left: -4, right: 8, top: 6 }}>
                {axes}
                {p.series.map((s) => <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stackId="1" stroke="#fff" strokeWidth={1.5} fill={s.color} fillOpacity={0.88} />)}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )
    default: {
      const stacked = spec.chart === 'stacked' || spec.pctOfTotal
      return (
        <div>
          {legend}
          <div style={{ height }}>
            <ResponsiveContainer>
              <BarChart data={p.rows} barGap={2} margin={{ left: -4, right: 8, top: 6 }}>
                {axes}
                {p.series.map((s, i) => (
                  <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} stackId={stacked ? 'a' : undefined} maxBarSize={stacked ? 34 : 16}
                    radius={!stacked || i === p.series.length - 1 ? [4, 4, 0, 0] : 0} stroke={stacked ? '#fff' : undefined} strokeWidth={stacked ? 1 : 0} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Tile(props: any) {
  const { x, y, width, height, name, color, value, depth } = props
  if (depth !== 1) return null
  const big = width > 70 && height > 36
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={4} fill={color} stroke="#fff" strokeWidth={2} />
      {big && <text x={x + 8} y={y + 18} fontSize={11} fontWeight={600} fill="#fff">{name}</text>}
      {big && <text x={x + 8} y={y + 33} fontSize={11} fill="rgba(255,255,255,0.85)">{compact(value, 1)}</text>}
    </g>
  )
}
