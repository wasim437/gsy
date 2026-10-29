import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BarList, C, ENTITY_COLOR, Legend, Tip, axisTick, fmtAxis } from '../components/charts'
import { Badge, Card, Kpi, MoneyView, PageHeader, TableWrap } from '../components/ui'
import { companyCommission, crmCommission, expensesForMonth, inMonth, monthlySeries, monthsWindow } from '../data/engine'
import { useStore } from '../data/store'
import { monthKey, monthLabel } from '../lib/dates'
import { compact, full, pct } from '../lib/format'

export default function CompanyCommission() {
  const { ctx, ds } = useStore()
  const comm = companyCommission(ctx)
  const crm = crmCommission(ctx)
  const exp = expensesForMonth(ctx, monthKey(ctx.ref))
  const totalCost = exp.total + crm.month.aed
  const surplus = comm.month.aed - totalCost
  const coverage = totalCost ? comm.month.aed / totalCost : 0
  const series = monthlySeries(ctx, monthsWindow(ctx, 11)).map((m) => ({ ...m, totalCost: m.expenses + m.crmComm }))
  const avgCost = series.reduce((s, m) => s + m.totalCost, 0) / series.length
  const monthsCovered = avgCost ? comm.toEarn.aed / avgCost : 0

  // Waterfall: commission → minus each cost → surplus. Floating bars use [low, high] ranges.
  let run = comm.month.aed
  const steps: { name: string; range: [number, number]; value: number; kind: 'in' | 'out' | 'total' }[] = [{ name: 'Commission', range: [0, run], value: run, kind: 'in' }]
  for (const [name, v] of [['Salary', exp.by.Salary], ['Rent', exp.by.Rent], ['Marketing', exp.by.Marketing], ['CRM commission', crm.month.aed], ['Other', exp.by.Other]] as const) {
    steps.push({ name, range: [run - v, run], value: -v, kind: 'out' })
    run -= v
  }
  steps.push({ name: surplus >= 0 ? 'Surplus' : 'Shortfall', range: [Math.min(0, run), Math.max(0, run)], value: run, kind: 'total' })

  const rowsMonth = comm.rows.filter((r) => inMonth(r.date, ctx))
  const sumBy = (key: (cId: string) => string) => {
    const m = new Map<string, { month: number; toDate: number; toEarn: number }>()
    for (const r of comm.rows) {
      const k = key(r.contractId)
      const e = m.get(k) ?? { month: 0, toDate: 0, toEarn: 0 }
      const v = ctx.toAED(r.amount, r.currency, r.date)
      if (inMonth(r.date, ctx)) e.month += v
      if (r.date <= ctx.ref) e.toDate += v
      if (r.date > ctx.monthEnd) e.toEarn += v
      m.set(k, e)
    }
    return m
  }
  const byCo = sumBy((id) => ctx.contractById.get(id)!.companyId)
  const byProd = sumBy((id) => ctx.contractById.get(id)!.productId)
  const byCountry = ds.countries.map((c) => ({
    key: c.code, label: c.name, color: ENTITY_COLOR[c.code],
    value: rowsMonth.filter((r) => ctx.investorById.get(ctx.contractById.get(r.contractId)!.investorId)?.country === c.code).reduce((s, r) => s + ctx.toAED(r.amount, r.currency, r.date), 0),
  }))

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Company Commission & Expenses" subtitle="The investment companies’ monthly commission income against salaries, rent, marketing, CRM commission and other costs" />

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-5">
        <Kpi label="Commission this month" accent="gold"><MoneyView m={comm.month} size="xl" /></Kpi>
        <Kpi label="Commission earned to date"><MoneyView m={comm.toDate} size="xl" /></Kpi>
        <Kpi label="Still to earn (to contract end)" sub={<>Covers ≈ <b className="text-ink">{monthsCovered.toFixed(1)} months</b> of average costs</>}><MoneyView m={comm.toEarn} size="xl" /></Kpi>
        <Kpi label="Costs this month" sub="Expenses + CRM commission"><span className="num text-2xl font-semibold"><span className="mr-1 text-xs text-muted">AED</span>{compact(totalCost, 2)}</span></Kpi>
        <Kpi label={surplus >= 0 ? 'Monthly surplus' : 'Monthly shortfall'} accent={surplus >= 0 ? 'good' : 'bad'} sub={`Commission covers ${pct(coverage, 0)} of costs`}>
          <span className={`num text-2xl font-semibold ${surplus >= 0 ? 'text-good' : 'text-bad'}`}><span className="mr-1 text-xs text-muted">AED</span>{surplus < 0 ? '−' : ''}{compact(Math.abs(surplus), 2)}</span>
        </Kpi>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
        <Card className="xl:col-span-2" title={`Where the commission goes: ${monthLabel(ctx.filters.month, 'long')}`} subtitle="Commission minus each cost · AED">
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={steps} margin={{ left: -8, right: 4, top: 8 }}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="name" tick={{ ...axisTick, fontSize: 10 }} axisLine={false} tickLine={false} interval={0} angle={-25} textAnchor="end" height={50} />
                <YAxis tickFormatter={fmtAxis} tick={axisTick} axisLine={false} tickLine={false} width={48} />
                <ReferenceLine y={0} stroke={C.axis} />
                <Tooltip cursor={{ fill: 'rgba(201,162,77,0.08)' }} content={({ active, payload }) => active && payload?.length ? (
                  <div className="rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-lg"><b>{payload[0].payload.name}</b><div className="num">AED {full(payload[0].payload.value)}</div></div>
                ) : null} />
                <Bar dataKey="range" radius={4} maxBarSize={40}>
                  {steps.map((s) => <Cell key={s.name} fill={s.kind === 'in' ? C.c1 : s.kind === 'out' ? C.c4 : s.value >= 0 ? C.good : C.bad} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <Badge tone="info">Income</Badge><Badge tone="bad">Cost</Badge><Badge tone={surplus >= 0 ? 'good' : 'bad'}>{surplus >= 0 ? 'Surplus' : 'Shortfall'}</Badge>
          </div>
        </Card>

        <Card className="xl:col-span-3" title="Commission vs costs: 12 months" subtitle="AED · line = surplus (below zero = shortfall)">
          <Legend items={[{ label: 'Company commission', color: C.c1 }, { label: 'Expenses + CRM commission', color: C.c2 }, { label: 'Surplus', color: C.c3, dash: true }]} />
          <div className="h-72">
            <ResponsiveContainer>
              <ComposedChart data={series} margin={{ left: -8, right: 8, top: 6 }}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m)} tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtAxis} tick={axisTick} axisLine={false} tickLine={false} width={48} />
                <ReferenceLine y={0} stroke={C.axis} />
                <Tooltip cursor={{ fill: 'rgba(201,162,77,0.08)' }} content={<Tip labelFmt={(l) => monthLabel(String(l), 'long')} />} />
                <Bar dataKey="companyComm" name="Company commission" fill={C.c1} radius={[4, 4, 0, 0]} maxBarSize={16} />
                <Bar dataKey="totalCost" name="Expenses + CRM commission" fill={C.c2} radius={[4, 4, 0, 0]} maxBarSize={16} />
                <Line dataKey="surplus" name="Surplus" stroke={C.c3} strokeWidth={2} dot={{ r: 3, fill: '#fff', strokeWidth: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card title="By investment company" subtitle="AED">
          <CommTable rows={[...byCo.entries()].map(([id, v]) => ({ name: ctx.companyById.get(id)!.name, rate: ctx.companyById.get(id)!.commissionPct, ...v }))} />
        </Card>
        <Card title="By product" subtitle="AED · product rate overrides company rate">
          <CommTable rows={[...byProd.entries()].sort().map(([id, v]) => ({ name: ctx.productById.get(id)!.name, rate: ctx.productById.get(id)!.companyCommissionPct, ...v }))} />
        </Card>
        <Card title="This month’s commission by country" subtitle="Investor residence · AED">
          <BarList rows={byCountry} />
          <div className="mt-5 border-t border-line-2 pt-4">
            <div className="mb-2 text-xs font-semibold text-muted">Expenses this month by category</div>
            <BarList rows={(['Salary', 'Rent', 'Marketing', 'Other'] as const).map((k): { key: string; label: string; value: number; color: string } => ({ key: k, label: k, value: exp.by[k], color: ENTITY_COLOR[k] })).concat([{ key: 'crm', label: 'CRM commission', value: crm.month.aed, color: C.c4 }])} />
          </div>
        </Card>
      </div>
    </div>
  )
}

function CommTable({ rows }: { rows: { name: string; rate: number | null; month: number; toDate: number; toEarn: number }[] }) {
  return (
    <TableWrap max="">
      <table className="tbl">
        <thead><tr><th>Name</th><th className="r">Rate</th><th className="r">Month</th><th className="r">To date</th><th className="r">To earn</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td className="font-medium">{r.name}</td>
              <td className="r text-muted">{r.rate ? pct(r.rate, 2) : 'default'}</td>
              <td className="r">{compact(r.month, 1)}</td>
              <td className="r">{compact(r.toDate, 1)}</td>
              <td className="r font-semibold">{compact(r.toEarn, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  )
}
