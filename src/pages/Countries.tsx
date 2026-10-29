import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { C, ENTITY_COLOR, Legend, Tip, axisTick, fmtAxis } from '../components/charts'
import { Card, PageHeader, Stat } from '../components/ui'
import { buildCtx, contractAED, crmCommission, expensesForMonth, filteredLeads, inMonth, isActive } from '../data/engine'
import { useStore } from '../data/store'
import { OPEN_STAGES } from '../data/types'
import { monthKey } from '../lib/dates'
import { compact, full } from '../lib/format'

export default function Countries() {
  const { ds, filters, today, user } = useStore()
  const cols = ds.countries.filter((c) => !user?.countries.length || user.countries.includes(c.code)).map((country) => {
    const ctx = buildCtx(ds, { ...filters, countries: [country.code] }, today)
    const local = country.localCurrency
    const funded = ctx.contracts.filter((c) => c.startDate <= ctx.ref)
    const raisedMonth = funded.filter((c) => inMonth(c.startDate, ctx))
    const toLocal = (aed: number) => aed / ctx.fx(local, ctx.ref)
    const raisedAED = funded.reduce((s, c) => s + contractAED(c, ctx), 0)
    const monthAED = raisedMonth.reduce((s, c) => s + contractAED(c, ctx), 0)
    const pipe = filteredLeads(ctx).filter((l) => OPEN_STAGES.includes(l.stage)).reduce((s, l) => s + (l.expectedAmount ? ctx.toAED(l.expectedAmount, l.currency, ctx.ref) : 0), 0)
    const exp = expensesForMonth(ctx, monthKey(ctx.ref)).total
    const crm = crmCommission(ctx)
    const investors = new Set(funded.filter((c) => isActive(c, ctx.ref)).map((c) => c.investorId)).size
    return { country, local, toLocal, raisedAED, monthAED, pipe, exp, crmEarned: crm.earned, crmPayable: crm.payable, investors, deals: raisedMonth.length }
  })
  const chart = [
    { m: 'Raised this month', ...Object.fromEntries(cols.map((c) => [c.country.name, Math.round(c.monthAED)])) },
    { m: 'Open pipeline', ...Object.fromEntries(cols.map((c) => [c.country.name, Math.round(c.pipe)])) },
    { m: 'Expenses this month', ...Object.fromEntries(cols.map((c) => [c.country.name, Math.round(c.exp)])) },
    { m: 'CRM commission earned', ...Object.fromEntries(cols.map((c) => [c.country.name, Math.round(c.crmEarned)])) },
  ]

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Country Teams" subtitle="UAE, India and Malaysia side by side, in local currency and AED" />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {cols.map((c) => (
          <Card key={c.country.code} title={<span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm" style={{ background: ENTITY_COLOR[c.country.code] }} />{c.country.team}</span>} subtitle={`Local currency ${c.local}`}>
            <div className="num text-2xl font-semibold sm:text-3xl">{c.local} {compact(c.toLocal(c.raisedAED), 2)}</div>
            <div className="text-xs text-muted">Total raised · ≈ AED {full(c.raisedAED)}</div>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <Stat label={`This month (${c.local})`} value={compact(c.toLocal(c.monthAED), 2)} />
              <Stat label="New deals" value={c.deals} />
              <Stat label={`Pipeline (${c.local})`} value={compact(c.toLocal(c.pipe), 2)} />
              <Stat label="Active investors" value={c.investors} />
              <Stat label={`Expenses (${c.local})`} value={compact(c.toLocal(c.exp), 2)} />
              <Stat label="CRM payable (AED)" value={compact(c.crmPayable, 1)} tone={c.crmPayable > 0 ? 'warn' : undefined} />
            </div>
          </Card>
        ))}
      </div>
      <Card title="Comparison in AED" subtitle="Same measures, one currency">
        <Legend items={cols.map((c) => ({ label: c.country.name, color: ENTITY_COLOR[c.country.code] }))} />
        <div className="h-72">
          <ResponsiveContainer>
            <BarChart data={chart} barGap={2} margin={{ left: -8, right: 4, top: 4 }}>
              <CartesianGrid vertical={false} stroke={C.grid} />
              <XAxis dataKey="m" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmtAxis} tick={axisTick} axisLine={false} tickLine={false} width={48} />
              <Tooltip cursor={{ fill: 'rgba(201,162,77,0.08)' }} content={<Tip />} />
              {cols.map((c) => <Bar key={c.country.code} dataKey={c.country.name} fill={ENTITY_COLOR[c.country.code]} radius={[4, 4, 0, 0]} maxBarSize={28} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  )
}
