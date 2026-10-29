/* eslint-disable @typescript-eslint/no-explicit-any */
import { ChevronRight, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { ResponsiveContainer, Sankey, Tooltip, Treemap } from 'recharts'
import { ENTITY_COLOR, Legend } from '../../components/charts'
import { Badge, Card, PageHeader } from '../../components/ui'
import { DIMS, breakdown, dimKey, moneyFlow, type Dim } from '../../data/analytics'
import { contractAED, isActive } from '../../data/engine'
import { useStore } from '../../data/store'
import { compact, full, pct } from '../../lib/format'

export default function MoneyFlow() {
  const { ctx, ds } = useStore()
  const flow = moneyFlow(ctx)
  const active = ctx.contracts.filter((c) => isActive(c, ctx.ref))
  const total = active.reduce((s, c) => s + contractAED(c, ctx), 0)

  const tree = ds.companies.filter((c) => c.type === 'Investment Co').map((co) => ({
    name: co.name,
    children: ds.products.map((p) => ({ name: p.name, pid: p.id, size: Math.round(active.filter((c) => c.companyId === co.id && c.productId === p.id).reduce((s, c) => s + contractAED(c, ctx), 0)) })).filter((x) => x.size > 0),
  }))

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Money Flow" subtitle={<>How AED {compact(total, 2)} of active capital travels: from investor countries, through the investment companies, into products</>} actions={<Badge tone="gold">Advanced analytics</Badge>} />

      <Card title="Capital flow (Sankey)" subtitle="Band width = active capital in AED · hover a band for the amount">
        <Legend items={[...ds.countries.map((c) => ({ label: c.name, color: ENTITY_COLOR[c.code] })), { label: 'Companies / products', color: '#22395c' }]} />
        <p className="mb-2 text-[0.6875rem] text-gold-600 sm:hidden">Swipe sideways to see the full chart →</p>
        <div className="scroll-thin -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="h-[420px] min-w-[680px] lg:min-w-0">
          <ResponsiveContainer>
            <Sankey
              data={flow}
              nodePadding={22}
              nodeWidth={14}
              margin={{ left: 8, right: 130, top: 10, bottom: 10 }}
              link={<FlowLink nodes={flow.nodes} />}
              node={<FlowNode nodes={flow.nodes} total={total} />}
            >
              <Tooltip content={({ active: a, payload }: any) => {
                if (!a || !payload?.length) return null
                const p = payload[0].payload?.payload ?? payload[0].payload
                const label = p.source && p.target ? `${p.source.name} → ${p.target.name}` : p.name
                return <div className="rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-lg"><b>{label}</b><div className="num">AED {full(p.value)} · {pct(p.value / total, 1)}</div></div>
              }} />
            </Sankey>
          </ResponsiveContainer>
        </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
        <Card className="xl:col-span-2" title="Capital map (treemap)" subtitle="Area = active capital · grouped by company, coloured by product">
          <Legend items={ds.products.map((p) => ({ label: p.name, color: ENTITY_COLOR[p.id] }))} />
          <div className="h-80">
            <ResponsiveContainer>
              <Treemap data={tree} dataKey="size" aspectRatio={1.4} isAnimationActive={false} content={<TreeTile />}>
                <Tooltip content={({ active: a, payload }: any) => a && payload?.length ? (
                  <div className="rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-lg"><b>{payload[0].payload.name}</b><div className="num">AED {full(payload[0].value)}</div></div>
                ) : null} />
              </Treemap>
            </ResponsiveContainer>
          </div>
        </Card>
        <Decomposition />
      </div>
    </div>
  )
}

function FlowNode(props: any) {
  const { x, y, width, height, index, payload, nodes, total } = props
  const id = nodes[index]?.id as string
  const isCountry = ['AE', 'IN', 'MY'].includes(id)
  const color = isCountry ? ENTITY_COLOR[id] : id?.startsWith('C') ? '#22395c' : ENTITY_COLOR[id] ?? '#22395c'
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={3} fill={color} />
      <text x={x + width + 8} y={y + height / 2 - 6} fontSize={12} fontWeight={600} fill="#14213a" dominantBaseline="middle">{payload.name}</text>
      <text x={x + width + 8} y={y + height / 2 + 9} fontSize={11} fill="#6b7486" dominantBaseline="middle">AED {compact(payload.value, 1)} · {pct(payload.value / total, 0)}</text>
    </g>
  )
}

function FlowLink(props: any) {
  const { sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, payload } = props
  const src = payload.source
  const id = props.nodes[src.index ?? 0]?.id
  const color = ENTITY_COLOR[id] ?? '#34507a'
  return (
    <path
      d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
      fill="none" stroke={color} strokeOpacity={0.28} strokeWidth={Math.max(1, linkWidth)}
      onMouseEnter={(e) => e.currentTarget.setAttribute('stroke-opacity', '0.55')}
      onMouseLeave={(e) => e.currentTarget.setAttribute('stroke-opacity', '0.28')}
    />
  )
}

function TreeTile(props: any) {
  const { x, y, width, height, depth, name, pid, value } = props
  if (depth === 1) return <rect x={x} y={y} width={width} height={height} fill="none" stroke="#fff" strokeWidth={5} />
  if (depth !== 2) return null
  const big = width > 70 && height > 38
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={4} fill={ENTITY_COLOR[pid]} stroke="#fff" strokeWidth={2} />
      {big && <text x={x + 8} y={y + 18} fontSize={11} fontWeight={600} fill="#fff">{name}</text>}
      {big && <text x={x + 8} y={y + 33} fontSize={11} fill="rgba(255,255,255,0.85)">{compact(value, 1)}</text>}
    </g>
  )
}

/** Decomposition tree: break the total down one dimension at a time; the biggest driver is pre-highlighted. */
function Decomposition() {
  const { ctx } = useStore()
  const [order, setOrder] = useState<Dim[]>(['country', 'company', 'product', 'sales'])
  const [path, setPath] = useState<string[]>([])
  const active = ctx.contracts.filter((c) => isActive(c, ctx.ref))
  const total = active.reduce((s, c) => s + contractAED(c, ctx), 0)

  const levels: { dim: Dim; items: ReturnType<typeof breakdown>; parentValue: number }[] = []
  let rows = active
  let parent = total
  for (let i = 0; i <= path.length && i < order.length; i++) {
    const items = breakdown(ctx, rows, order[i])
    levels.push({ dim: order[i], items, parentValue: parent })
    if (i < path.length) {
      const sel = items.find((x) => x.key === path[i])
      if (!sel) break
      rows = rows.filter((c) => dimKey(c, order[i], ctx)[0] === path[i])
      parent = sel.value
    }
  }

  return (
    <Card className="xl:col-span-3" title="Decomposition tree" subtitle="Click a bar to drill into it. ★ marks the biggest driver at each level." action={<button onClick={() => setPath([])} className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink"><RotateCcw size={13} /> Reset</button>}>
      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-muted">Order:</span>
        {order.map((d, i) => (
          <select key={i} value={d} onChange={(e) => { const o = [...order]; o[i] = e.target.value as Dim; setOrder(o); setPath(path.slice(0, i)) }} className="rounded-md border border-line bg-surface px-1.5 py-1">
            {DIMS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        ))}
      </div>
      <div className="scroll-thin flex flex-col gap-3 pb-2 sm:flex-row sm:overflow-x-auto">
        <div className="w-full sm:w-36 sm:shrink-0">
          <div className="mb-2 text-[0.625rem] font-semibold tracking-wider text-muted uppercase">Total</div>
          <div className="rounded-xl bg-navy-900 p-3 text-white">
            <div className="text-[0.6875rem] text-white/60">Active capital</div>
            <div className="num text-lg font-semibold">{compact(total, 2)}</div>
            <div className="text-[0.6875rem] text-white/60">{active.length} contracts</div>
          </div>
        </div>
        {levels.map((lv, i) => {
          const max = lv.items[0]?.value || 1
          return (
            <div key={i} className="flex w-full items-start gap-2 sm:w-48 sm:shrink-0">
              <ChevronRight size={16} className="mt-8 hidden shrink-0 text-muted sm:block" />
              <div className="min-w-0 flex-1">
                <div className="mb-2 text-[0.625rem] font-semibold tracking-wider text-muted uppercase">{DIMS.find((d) => d.id === lv.dim)?.label}</div>
                <div className="grid max-h-80 grid-cols-2 gap-1.5 overflow-y-auto pr-1 sm:flex sm:flex-col">
                  {lv.items.map((it, j) => {
                    const selected = path[i] === it.key
                    return (
                      <button key={it.key} onClick={() => setPath([...path.slice(0, i), it.key])} className={`rounded-lg border px-2 py-1.5 text-left transition ${selected ? 'border-gold-500 bg-gold-50' : 'border-line hover:border-gold-500/60'}`}>
                        <div className="flex items-center justify-between gap-1 text-[0.6875rem]">
                          <span className="truncate font-medium">{j === 0 && '★ '}{it.label}</span>
                          <span className="num shrink-0 text-muted">{pct(it.value / lv.parentValue, 0)}</span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-line-2"><div className="h-full rounded-full" style={{ width: `${(it.value / max) * 100}%`, background: selected ? '#a87a22' : '#2f5ba8' }} /></div>
                        <div className="num mt-0.5 text-[0.6875rem] font-semibold">{compact(it.value, 2)}</div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
