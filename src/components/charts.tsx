import type { ReactNode } from 'react'
import { compact, full } from '../lib/format'

// Categorical order is fixed: an entity keeps its color on every chart.
export const C = {
  c1: '#2f5ba8', // navy-blue
  c2: '#b8862a', // gold
  c3: '#14998a', // teal
  c4: '#c4553d', // rust
  c5: '#8a62c2', // violet
  grid: '#ece8de',
  axis: '#6b7486',
  good: '#15803d',
  bad: '#b91c1c',
  warn: '#b45309',
  muted: '#c9c3b5',
}
export const SERIES = [C.c1, C.c2, C.c3, C.c4, C.c5]

/** Stable color per known entity, so filters never repaint survivors. */
export const ENTITY_COLOR: Record<string, string> = {
  AE: C.c1, IN: C.c2, MY: C.c3,
  UAE: C.c1, India: C.c2, Malaysia: C.c3,
  C01: C.c1, C02: C.c2,
  P1: C.c1, P2: C.c2, P3: C.c3, P4: C.c4, P5: C.c5,
  AED: C.c1, USD: C.c2, INR: C.c3, MYR: C.c4, SGD: C.c5,
  S01: C.c1, S02: C.c2, S03: C.c3, S04: C.c4,
  Salary: C.c1, Rent: C.c2, Marketing: C.c3, Other: C.c5,
}

export const axisTick = { fontSize: 11, fill: C.axis }
export const fmtAxis = (v: number) => compact(v, 0)

export function Legend({ items }: { items: { label: string; color: string; dash?: boolean }[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          {i.dash ? (
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: i.color }} />
          ) : (
            <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: i.color }} />
          )}
          {i.label}
        </span>
      ))}
    </div>
  )
}

interface TipPayload {
  name?: string
  value?: number
  color?: string
  fill?: string
  stroke?: string
  dataKey?: string | number
  payload?: Record<string, unknown>
}

export function Tip({ active, payload, label, unit = 'AED', labelFmt }: { active?: boolean; payload?: TipPayload[]; label?: ReactNode; unit?: string; labelFmt?: (l: ReactNode) => ReactNode }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-line bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      {label !== undefined && <div className="mb-1 font-semibold text-ink">{labelFmt ? labelFmt(label) : label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-ink-2">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: p.color || p.fill || p.stroke }} />
            {p.name}
          </span>
          <span className="num font-semibold text-ink">
            {unit && <span className="mr-1 font-normal text-muted">{unit}</span>}
            {full(Number(p.value ?? 0))}
          </span>
        </div>
      ))}
    </div>
  )
}

/** Horizontal bar list: label · bar · value. Readable on phones, no axis needed. */
export function BarList({ rows, color = C.c1, format = (v: number) => `AED ${compact(v, 2)}`, onClick }: { rows: { key: string; label: ReactNode; value: number; color?: string; sub?: ReactNode }[]; color?: string; format?: (v: number) => string; onClick?: (key: string) => void }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)))
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <div key={r.key} className={`group ${onClick ? 'cursor-pointer' : ''}`} onClick={() => onClick?.(r.key)} title={`${full(r.value)}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate font-medium text-ink-2 group-hover:text-ink">{r.label}</span>
            <span className="num shrink-0 font-semibold text-ink">{format(r.value)}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-line-2">
            <div className="h-full rounded-full transition-all" style={{ width: `${(Math.abs(r.value) / max) * 100}%`, background: r.color ?? color }} />
          </div>
          {r.sub && <div className="mt-0.5 text-[0.6875rem] text-muted">{r.sub}</div>}
        </div>
      ))}
    </div>
  )
}

/** Segmented single bar for part-of-whole with ≤5 parts (more legible than a donut). */
export function SplitBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1
  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full">
        {parts.filter((p) => p.value > 0).map((p) => (
          <div key={p.label} title={`${p.label}: ${full(p.value)}`} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} className="first:rounded-l-full last:rounded-r-full" />
        ))}
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
        {parts.map((p) => (
          <div key={p.label} className="flex items-center justify-between gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 text-ink-2">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: p.color }} />
              {p.label}
            </span>
            <span className="num font-semibold text-ink">{((p.value / total) * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
