import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { C, Legend, Tip, axisTick, fmtAxis } from '../components/charts'
import { Card, Kpi, MoneyView, PageHeader, StatusBadge, TableWrap } from '../components/ui'
import { contractAED, homeKpis, sumMoney } from '../data/engine'
import { useStore } from '../data/store'
import { addMonthKey, daysBetween, fmtDate, monthKey, monthLabel } from '../lib/dates'
import { full, pct } from '../lib/format'

const RENEWAL = [
  ['Renewing', C.c3],
  ['Undecided', C.c2],
  ['Returning capital', C.c4],
] as const

export default function Contracts() {
  const { ctx } = useStore()
  const k = homeKpis(ctx)
  const months = [0, 1, 2, 3].map((i) => addMonthKey(ctx.filters.month, i))
  const expiring = ctx.contracts.filter((c) => months.includes(monthKey(c.endDate))).sort((a, b) => a.endDate.localeCompare(b.endDate))
  const chart = months.map((m) => {
    const row: Record<string, number | string> = { month: m }
    for (const [s] of RENEWAL) row[s] = expiring.filter((c) => monthKey(c.endDate) === m && c.renewalStatus === s).reduce((a, c) => a + ctx.toAED(c.amount, c.currency, c.endDate), 0)
    return row
  })
  const next3 = expiring.filter((c) => monthKey(c.endDate) !== ctx.filters.month)
  const decided = expiring.filter((c) => c.renewalStatus === 'Renewing' || c.renewalStatus === 'Returning capital')
  const renewalRate = decided.length ? decided.filter((c) => c.renewalStatus === 'Renewing').length / decided.length : 0

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Contracts: New & Expiring" subtitle="New money this month, contracts reaching maturity and capital that must be returned" />
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <Kpi label="New contracts this month" accent="gold" sub={`${k.newThisMonth.length} contracts`}><MoneyView m={k.newMoney} size="xl" /></Kpi>
        <Kpi label="Expiring this month" sub={`${k.expiring.length} contracts · capital to return`}><MoneyView m={k.expiringCapital} size="xl" /></Kpi>
        <Kpi label="Expiring next 3 months" sub={`${next3.length} contracts · capital to return`}><MoneyView m={sumMoney(next3, (c) => c.amount, (c) => c.currency, (c) => c.endDate, ctx)} size="xl" /></Kpi>
        <Kpi label="Renewal rate" accent={renewalRate >= 0.6 ? 'good' : 'bad'} sub={`${decided.length} decided of ${expiring.length} expiring`}><span className="num text-2xl font-semibold sm:text-3xl">{pct(renewalRate, 0)}</span></Kpi>
      </div>

      <Card title="Capital maturing by month" subtitle="This month and the next 3 · AED · split by renewal status">
        <Legend items={RENEWAL.map(([l, c]) => ({ label: l, color: c }))} />
        <div className="h-60">
          <ResponsiveContainer>
            <BarChart data={chart} margin={{ left: -8, right: 4, top: 4 }}>
              <CartesianGrid vertical={false} stroke={C.grid} />
              <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m, 'long')} tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmtAxis} tick={axisTick} axisLine={false} tickLine={false} width={48} />
              <Tooltip cursor={{ fill: 'rgba(201,162,77,0.08)' }} content={<Tip labelFmt={(l) => monthLabel(String(l), 'long')} />} />
              {RENEWAL.map(([s, color], i) => (
                <Bar key={s} dataKey={s} name={s} stackId="a" fill={color} maxBarSize={56} stroke="#fff" strokeWidth={1} radius={i === RENEWAL.length - 1 ? [4, 4, 0, 0] : 0} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Expiring contracts" subtitle={`${expiring.length} contracts mature between ${monthLabel(months[0], 'long')} and ${monthLabel(months[3], 'long')}`}>
        <TableWrap max="max-h-[520px]">
          <table className="tbl">
            <thead><tr><th>Maturity</th><th className="r">Days left</th><th>Investor</th><th>Contract</th><th>Product</th><th className="r">Capital to return</th><th className="r">AED</th><th>Renewal</th><th>Salesperson</th></tr></thead>
            <tbody>
              {expiring.map((c) => {
                const d = daysBetween(ctx.ref, c.endDate)
                return (
                  <tr key={c.id}>
                    <td className={d <= 7 ? 'font-semibold text-warn' : ''}>{fmtDate(c.endDate)}</td>
                    <td className="r">{d < 0 ? <span className="text-muted">matured</span> : d}</td>
                    <td><Link className="font-medium hover:text-gold-600 hover:underline" to={`/investors/${c.investorId}`}>{ctx.investorById.get(c.investorId)?.fullName}</Link></td>
                    <td>{c.id}</td>
                    <td>{ctx.productById.get(c.productId)?.name}</td>
                    <td className="r font-semibold">{c.currency} {full(c.amount)}</td>
                    <td className="r">{full(ctx.toAED(c.amount, c.currency, c.endDate))}</td>
                    <td><StatusBadge s={c.renewalStatus} /></td>
                    <td>{ctx.salesById.get(c.salesId)?.name}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      <Card title="New contracts this month" subtitle={`${k.newThisMonth.length} contracts · AED ${full(k.newMoney.aed)}`}>
        <TableWrap>
          <table className="tbl">
            <thead><tr><th>Start</th><th>Investor</th><th>Contract</th><th>Company</th><th>Product</th><th className="r">Amount</th><th className="r">AED</th><th>Salesperson</th></tr></thead>
            <tbody>
              {k.newThisMonth.map((c) => (
                <tr key={c.id}>
                  <td>{fmtDate(c.startDate)}</td>
                  <td><Link className="font-medium hover:text-gold-600 hover:underline" to={`/investors/${c.investorId}`}>{ctx.investorById.get(c.investorId)?.fullName}</Link></td>
                  <td>{c.id}</td>
                  <td>{ctx.companyById.get(c.companyId)?.name}</td>
                  <td>{ctx.productById.get(c.productId)?.name}</td>
                  <td className="r font-semibold">{c.currency} {full(c.amount)}</td>
                  <td className="r">{full(contractAED(c, ctx))}</td>
                  <td>{ctx.salesById.get(c.salesId)?.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </div>
  )
}
