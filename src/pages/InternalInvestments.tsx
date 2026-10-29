import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BarList, C, ENTITY_COLOR, Legend, Tip, axisTick, fmtAxis } from '../components/charts'
import { Badge, Card, Kpi, MoneyView, PageHeader, TableWrap } from '../components/ui'
import { filteredInternal, inMonth, sumMoney } from '../data/engine'
import { useStore } from '../data/store'
import { fmtDate, monthKey, monthLabel } from '../lib/dates'
import { full } from '../lib/format'

export default function InternalInvestments() {
  const { ctx, ds } = useStore()
  const rows = filteredInternal(ctx)
  const subs = ds.companies.filter((c) => c.type === 'Sub-company')
  const total = sumMoney(rows, (t) => t.amount, (t) => t.currency, (t) => t.date, ctx)
  const month = sumMoney(rows.filter((t) => inMonth(t.date, ctx)), (t) => t.amount, (t) => t.currency, (t) => t.date, ctx)
  const outflow = rows.filter((t) => t.amount > 0).reduce((s, t) => s + ctx.toAED(t.amount, t.currency, t.date), 0)
  const repaid = -rows.filter((t) => t.amount < 0).reduce((s, t) => s + ctx.toAED(t.amount, t.currency, t.date), 0)

  const bySub = subs.map((s) => {
    const r = rows.filter((t) => t.toCompanyId === s.id)
    const local = r.reduce((a, t) => a + t.amount, 0)
    return { key: s.id, label: <>{s.name} <span className="text-muted">· {ds.countries.find((c) => c.code === s.country)?.name}</span></>, value: r.reduce((a, t) => a + ctx.toAED(t.amount, t.currency, t.date), 0), color: ENTITY_COLOR[s.id], sub: `${r[0]?.currency ?? ''} ${full(local)} · ${r.length} transfers` }
  })

  // Running balance per sub-company, by month (AED)
  const months = [...new Set(rows.map((t) => monthKey(t.date)))].sort()
  const running: Record<string, number> = {}
  const series = months.map((m) => {
    const point: Record<string, number | string> = { month: m }
    for (const s of subs) {
      running[s.id] = (running[s.id] ?? 0) + rows.filter((t) => t.toCompanyId === s.id && monthKey(t.date) === m).reduce((a, t) => a + ctx.toAED(t.amount, t.currency, t.date), 0)
      point[s.id] = Math.round(running[s.id])
    }
    return point
  })

  const balances: Record<string, number> = {}
  const ledger = rows.map((t) => {
    balances[t.toCompanyId] = (balances[t.toCompanyId] ?? 0) + t.amount
    return { t, balance: balances[t.toCompanyId] }
  }).reverse()

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Internal Investments" subtitle="Group money sent to sub-companies in the UAE and abroad, with each sub-company’s running balance" />
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <Kpi label="Net invested in sub-companies" accent="gold"><MoneyView m={total} size="xl" /></Kpi>
        <Kpi label="Sent this month"><MoneyView m={month} size="xl" /></Kpi>
        <Kpi label="Total sent (gross)"><span className="num text-2xl font-semibold"><span className="mr-1 text-xs text-muted">AED</span>{full(outflow)}</span></Kpi>
        <Kpi label="Repaid to group"><span className="num text-2xl font-semibold text-good"><span className="mr-1 text-xs text-muted">AED</span>{full(repaid)}</span></Kpi>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
        <Card className="xl:col-span-2" title="Balance by sub-company" subtitle="Net AED · original currency below">
          <BarList rows={bySub} />
        </Card>
        <Card className="xl:col-span-3" title="Running balance over time" subtitle="Cumulative AED by sub-company">
          <Legend items={subs.map((s) => ({ label: s.name, color: ENTITY_COLOR[s.id] }))} />
          <div className="h-60">
            <ResponsiveContainer>
              <AreaChart data={series} margin={{ left: -8, right: 8, top: 6 }}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m)} tick={axisTick} axisLine={false} tickLine={false} minTickGap={20} />
                <YAxis tickFormatter={fmtAxis} tick={axisTick} axisLine={false} tickLine={false} width={48} />
                <Tooltip content={<Tip labelFmt={(l) => monthLabel(String(l), 'long')} />} />
                {subs.map((s) => (
                  <Area key={s.id} type="stepAfter" dataKey={s.id} name={s.name} stackId="1" stroke={ENTITY_COLOR[s.id]} strokeWidth={1.5} fill={ENTITY_COLOR[s.id]} fillOpacity={0.55} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title="Transfer ledger" subtitle="Newest first · running balance per sub-company in its own currency">
        <TableWrap max="max-h-[520px]">
          <table className="tbl">
            <thead><tr><th>Date</th><th>Reference</th><th>From</th><th>To</th><th>Country</th><th>Purpose</th><th className="r">Amount</th><th className="r">AED</th><th className="r">Running balance</th></tr></thead>
            <tbody>
              {ledger.map(({ t, balance }) => (
                <tr key={t.id}>
                  <td>{fmtDate(t.date)}</td>
                  <td className="text-muted">{t.id}</td>
                  <td>{ctx.companyById.get(t.fromCompanyId)?.name}</td>
                  <td className="font-medium">{ctx.companyById.get(t.toCompanyId)?.name}</td>
                  <td>{ds.countries.find((c) => c.code === t.country)?.name}</td>
                  <td>{t.amount < 0 ? <Badge tone="good">{t.purpose}</Badge> : t.purpose}</td>
                  <td className={`r font-semibold ${t.amount < 0 ? 'text-good' : ''}`}>{t.currency} {full(t.amount)}</td>
                  <td className="r">{full(ctx.toAED(t.amount, t.currency, t.date))}</td>
                  <td className="r">{t.currency} {full(balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </div>
  )
}
