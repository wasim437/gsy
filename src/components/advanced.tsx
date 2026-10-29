import type { ReactNode } from 'react'
import { compact } from '../lib/format'

// Sequential ramp (one hue, light → dark) for magnitude: heatmaps, calendars.
const LO = [236, 241, 248]
const HI = [27, 58, 118]
export function seq(t: number): string {
  const x = Math.max(0, Math.min(1, t))
  const c = LO.map((l, i) => Math.round(l + (HI[i] - l) * x))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}
export const seqInk = (t: number) => (t > 0.55 ? '#ffffff' : '#14213a')

export function SeqLegend({ min = '0', max, label }: { min?: string; max: string; label: string }) {
  return (
    <div className="flex items-center gap-2 text-[0.6875rem] text-muted">
      <span>{label}</span>
      <span>{min}</span>
      <span className="h-2.5 w-28 rounded-full" style={{ background: `linear-gradient(90deg, ${seq(0)}, ${seq(0.5)}, ${seq(1)})` }} />
      <span>{max}</span>
    </div>
  )
}

/** Heatmap table: rows × columns, cell shade = value / max. */
export function Heatmap({ rows, cols, fmt = (v) => compact(v, 1), max: maxIn, onCell }: {
  rows: { label: ReactNode; cells: (number | null)[] }[]
  cols: string[]
  fmt?: (v: number) => string
  max?: number
  onCell?: (r: number, c: number) => void
}) {
  const max = maxIn ?? Math.max(1, ...rows.flatMap((r) => r.cells.map((v) => v ?? 0)))
  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="w-full border-separate" style={{ borderSpacing: 2 }}>
        <thead>
          <tr>
            <th />
            {cols.map((c) => <th key={c} className="px-1 pb-1 text-center text-[0.625rem] font-semibold whitespace-nowrap text-muted uppercase">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="pr-2 text-xs font-medium whitespace-nowrap text-ink-2">{r.label}</td>
              {r.cells.map((v, j) => {
                const t = v === null ? 0 : v / max
                return (
                  <td
                    key={j}
                    onClick={() => onCell?.(i, j)}
                    title={v === null ? 'No data' : fmt(v)}
                    className={`num h-8 min-w-12 rounded-md text-center text-[0.6875rem] font-semibold transition hover:ring-2 hover:ring-gold-500 ${onCell ? 'cursor-pointer' : ''}`}
                    style={{ background: v === null ? '#f4f2ec' : seq(t), color: v === null ? '#b8b2a4' : seqInk(t) }}
                  >
                    {v === null ? '·' : v === 0 ? '' : fmt(v)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Semicircle gauge with red / amber / green zones and a needle. */
export function Gauge({ value, max = 2.5, zones = [[0, 1.2, '#b91c1c'], [1.2, 1.5, '#b45309'], [1.5, 2.5, '#15803d']], label }: { value: number; max?: number; zones?: [number, number, string][]; label: string }) {
  const R = 90
  const cx = 110
  const cy = 105
  const ang = (v: number) => Math.PI * (1 - Math.min(max, Math.max(0, v)) / max)
  const pt = (v: number, r = R) => [cx + r * Math.cos(ang(v)), cy - r * Math.sin(ang(v))]
  const arc = (a: number, b: number) => {
    const [x1, y1] = pt(a)
    const [x2, y2] = pt(b)
    return `M${x1},${y1} A${R},${R} 0 0 1 ${x2},${y2}`
  }
  const [nx, ny] = pt(value, R - 18)
  const zone = zones.find(([a, b]) => value >= a && value < b) ?? zones[zones.length - 1]
  return (
    <svg viewBox="0 0 220 130" className="w-full max-w-[280px]" role="img" aria-label={`${label}: ${value.toFixed(2)}`}>
      {zones.map(([a, b, c]) => <path key={a} d={arc(a, b)} stroke={c} strokeWidth={16} fill="none" opacity={0.85} />)}
      {[0, 1, 1.2, 1.5, 2, max].map((t) => {
        const [x, y] = pt(t, R + 14)
        return <text key={t} x={x} y={y} fontSize={9} fill="#6b7486" textAnchor="middle" dominantBaseline="middle">{t}×</text>
      })}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#0f1d33" strokeWidth={3} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={6} fill="#0f1d33" />
      <text x={cx} y={cy + 22} textAnchor="middle" fontSize={20} fontWeight={700} fill={zone[2]}>{value.toFixed(2)}×</text>
    </svg>
  )
}

/** Bullet chart: actual bar vs target marker over qualitative bands. */
export function Bullet({ label, actual, target, fmt = (v: number) => compact(v, 2) }: { label: ReactNode; actual: number; target: number; fmt?: (v: number) => string }) {
  const max = Math.max(actual, target) * 1.15 || 1
  const pct = actual / (target || 1)
  const tone = pct >= 1 ? 'text-good' : pct >= 0.75 ? 'text-warn' : 'text-bad'
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="font-medium text-ink-2">{label}</span>
        <span className="num"><b className={tone}>{(pct * 100).toFixed(0)}%</b> <span className="text-muted">· AED {fmt(actual)} of {fmt(target)}</span></span>
      </div>
      <div className="relative h-5 overflow-hidden rounded-md bg-line-2" title={`Actual ${fmt(actual)} · Target ${fmt(target)}`}>
        <div className="absolute inset-y-0 left-0 bg-[#e6e1d3]" style={{ width: `${(target * 0.75 / max) * 100}%` }} />
        <div className="absolute inset-y-0 left-0 bg-[#efebe1]" style={{ width: `${(target / max) * 100}%`, mixBlendMode: 'multiply' }} />
        <div className="absolute inset-y-[5px] left-0 rounded-r-sm bg-navy-800" style={{ width: `${(actual / max) * 100}%` }} />
        <div className="absolute inset-y-0.5 w-[3px] rounded bg-gold-600" style={{ left: `calc(${(target / max) * 100}% - 1px)` }} />
      </div>
    </div>
  )
}

export function Slider({ label, value, min, max, step = 1, unit = '%', onChange, hint }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void; hint?: string }) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="font-medium text-ink-2">{label}</span>
        <span className="num rounded-md bg-navy-900 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-white">{value > 0 && min < 0 ? '+' : ''}{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[#a87a22]" />
      {hint && <div className="text-[0.6875rem] text-muted">{hint}</div>}
    </label>
  )
}
