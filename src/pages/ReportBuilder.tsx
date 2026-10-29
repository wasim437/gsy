import { Download, Pin, PinOff, Sparkles, Wand2 } from 'lucide-react'
import { useState } from 'react'
import VizChart, { usePivot } from '../components/VizChart'
import { Badge, Btn, Card, PageHeader } from '../components/ui'
import { CHARTS, DEFAULT_SPEC, DIM_LABEL, MEASURES, RANGES, specTitle, toCSV, type VizSpec } from '../data/explore'
import { compact, full } from '../lib/format'

const QUICK: { name: string; spec: VizSpec }[] = [
  { name: 'Money raised by country', spec: { ...DEFAULT_SPEC, measure: 'investment', dim: 'country', chart: 'stacked' } },
  { name: 'Payout commitments, next 12 months', spec: { ...DEFAULT_SPEC, measure: 'profitDue', dim: 'product', chart: 'stacked', range: 'N12M' } },
  { name: 'Capital to return by quarter', spec: { ...DEFAULT_SPEC, measure: 'capitalDue', dim: 'company', chart: 'column', range: 'N12M', grain: 'quarter' } },
  { name: 'Active capital growth', spec: { ...DEFAULT_SPEC, measure: 'activeCapital', dim: 'product', chart: 'area', range: 'L24M' } },
  { name: 'Expense mix', spec: { ...DEFAULT_SPEC, measure: 'expenses', dim: 'category', chart: 'donut', range: 'YTD' } },
  { name: 'Top salespeople', spec: { ...DEFAULT_SPEC, measure: 'investment', dim: 'sales', chart: 'bar', topN: 8, range: 'L12M' } },
  { name: 'Overdue by country', spec: { ...DEFAULT_SPEC, measure: 'overdue', dim: 'country', chart: 'treemap', range: 'ALL' } },
  { name: 'Cumulative payouts', spec: { ...DEFAULT_SPEC, measure: 'payouts', dim: 'currency', chart: 'area', cumulative: true, range: 'L12M' } },
  { name: 'Pipeline by stage', spec: { ...DEFAULT_SPEC, measure: 'pipeline', dim: 'category', chart: 'bar', range: 'L6M' } },
  { name: 'Currency share of new money', spec: { ...DEFAULT_SPEC, measure: 'investment', dim: 'currency', chart: 'stacked', pctOfTotal: true } },
]

function loadPins(): VizSpec[] {
  try { return JSON.parse(localStorage.getItem('gsy.pins') ?? '[]') } catch { return [] }
}

export default function ReportBuilder() {
  const [spec, setSpec] = useState<VizSpec>(QUICK[0].spec)
  const [pins, setPins] = useState<VizSpec[]>(loadPins)
  const meta = MEASURES.find((m) => m.id === spec.measure)!
  const set = (p: Partial<VizSpec>) => setSpec((s) => {
    const next = { ...s, ...p, title: undefined }
    const m = MEASURES.find((x) => x.id === next.measure)!
    if (next.dim !== 'none' && !m.dims.includes(next.dim)) next.dim = m.dims[0]
    return next
  })
  const savePins = (next: VizSpec[]) => { setPins(next); try { localStorage.setItem('gsy.pins', JSON.stringify(next)) } catch { /* storage blocked */ } }
  const p = usePivot(spec)

  const exportCSV = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([toCSV(p)], { type: 'text/csv' }))
    a.download = `${specTitle(spec).replace(/[^a-z0-9]+/gi, '-')}.csv`
    a.click()
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Report Builder" subtitle="Build any chart in seconds: pick what to measure, how to split it, the period and the chart type. Pin the ones you like." actions={<Badge tone="gold" icon={<Wand2 size={12} />}>Like Power BI, made for GSY</Badge>} />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {QUICK.map((q) => (
          <button key={q.name} onClick={() => setSpec(q.spec)} className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${JSON.stringify(q.spec) === JSON.stringify(spec) ? 'border-navy-900 bg-navy-900 text-white' : 'border-line bg-surface hover:border-gold-500'}`}>
            <Sparkles size={12} /> {q.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[300px_1fr]">
        <Card title="Build" subtitle="Every choice updates the chart instantly">
          <div className="flex flex-col gap-4">
            <Ctl label="Measure (what)">
              <select value={spec.measure} onChange={(e) => set({ measure: e.target.value as VizSpec['measure'] })} className="input">
                {MEASURES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </Ctl>
            <Ctl label="Split by">
              <div className="flex flex-wrap gap-1.5">
                {(['none', ...meta.dims] as VizSpec['dim'][]).map((d) => (
                  <Chip key={d} on={spec.dim === d} onClick={() => set({ dim: d })}>{d === 'category' ? meta.category ?? 'Category' : DIM_LABEL[d]}</Chip>
                ))}
              </div>
            </Ctl>
            <Ctl label="Chart type">
              <div className="grid grid-cols-3 gap-1.5">
                {CHARTS.map((c) => <Chip key={c.id} on={spec.chart === c.id} onClick={() => set({ chart: c.id })}>{c.label}</Chip>)}
              </div>
            </Ctl>
            <Ctl label="Period">
              <select value={spec.range} onChange={(e) => set({ range: e.target.value as VizSpec['range'] })} className="input">
                {RANGES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </Ctl>
            <Ctl label="Time grain">
              <div className="grid grid-cols-3 gap-1.5">
                {(['month', 'quarter', 'year'] as const).map((g) => <Chip key={g} on={spec.grain === g} onClick={() => set({ grain: g })}>{g[0].toUpperCase() + g.slice(1)}</Chip>)}
              </div>
            </Ctl>
            <Ctl label={`Show top ${spec.topN} (rest = Other)`}>
              <input type="range" min={1} max={10} value={spec.topN} onChange={(e) => set({ topN: +e.target.value })} className="w-full accent-[#a87a22]" />
            </Ctl>
            <div className="flex flex-col gap-2 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={spec.cumulative} disabled={meta.snapshot} onChange={(e) => set({ cumulative: e.target.checked })} className="accent-[#0f1d33]" /> Running total</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={spec.pctOfTotal} onChange={(e) => set({ pctOfTotal: e.target.checked })} className="accent-[#0f1d33]" /> Show as % of total</label>
            </div>
          </div>
        </Card>

        <div className="flex min-w-0 flex-col gap-3">
          <Card
            title={specTitle(spec)}
            subtitle={<>Total <b className="num text-ink">{meta.unit === 'count' ? full(p.grand) : `AED ${full(p.grand)}`}</b> · respects the filters at the top</>}
            action={
              <div className="flex gap-1.5">
                <Btn variant="ghost" icon={<Download size={14} />} onClick={exportCSV}>CSV</Btn>
                <Btn variant="gold" icon={<Pin size={14} />} onClick={() => savePins([...pins, { ...spec, title: specTitle(spec) }])}>Pin</Btn>
              </div>
            }
          >
            <VizChart spec={spec} height={340} />
          </Card>
          {spec.chart !== 'table' && spec.chart !== 'kpi' && (
            <Card title="Data behind the chart" subtitle={`${p.rows.length} periods × ${p.series.length} series`}>
              <VizChart spec={{ ...spec, chart: 'table' }} height={200} />
            </Card>
          )}
        </div>
      </div>

      {pins.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[0.9375rem] font-semibold">My pinned reports <span className="text-muted">({pins.length})</span></h2>
            <button onClick={() => savePins([])} className="text-xs text-muted hover:text-bad">Unpin all</button>
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {pins.map((s, i) => (
              <Card key={i} title={s.title} action={
                <div className="flex gap-1">
                  <button onClick={() => setSpec({ ...s, title: undefined })} className="rounded-md px-2 py-1 text-xs text-gold-600 hover:bg-gold-50">Edit</button>
                  <button onClick={() => savePins(pins.filter((_, j) => j !== i))} className="rounded-md p-1 text-muted hover:text-bad" aria-label="Unpin"><PinOff size={14} /></button>
                </div>
              }>
                <VizChart spec={s} height={220} />
              </Card>
            ))}
          </div>
        </div>
      )}
      <p className="text-[0.6875rem] text-muted">Pinned reports are saved on this device for now; in the live version they are saved to your account. Totals over {compact(1e3)} are shortened (K = thousand, M = million).</p>
    </div>
  )
}

function Ctl({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="mb-1.5 text-[0.6875rem] font-semibold tracking-wide text-muted uppercase">{label}</div>{children}</div>
}
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${on ? 'border-navy-900 bg-navy-900 text-white' : 'border-line bg-surface hover:border-gold-500'}`}>{children}</button>
}
