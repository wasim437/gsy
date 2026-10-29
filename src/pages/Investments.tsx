import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Link } from 'react-router-dom'
import { BarList, C, ENTITY_COLOR, Legend, SplitBar, Tip, axisTick, fmtAxis } from '../components/charts'
import { Card, Kpi, MoneyView, PageHeader, TableWrap } from '../components/ui'
import { contractAED, homeKpis, inMonth, isActive, monthlySeries, monthsWindow, sumMoney } from '../data/engine'
import { useStore } from '../data/store'
import { CURRENCIES } from '../data/types'
import { fmtDate, monthLabel } from '../lib/dates'
import { compact, full, pct } from '../lib/format'

export default function Investments() {
  const { ctx, ds, toggleFilter } = useStore()
  const k = homeKpis(ctx)
  const funded = ctx.contracts.filter((c) => c.startDate <= ctx.ref)
  const active = funded.filter((c) => isActive(c, ctx.ref))
  const matured = ctx.contracts.filter((c) => inMonth(c.endDate, ctx) && c.endDate <= ctx.ref)
  const series = monthlySeries(ctx, monthsWindow(ctx, 11))
  const sumAED = (pred: (c: (typeof active)[number]) => boolean) => active.filter(pred).reduce((s, c) => s + contractAED(c, ctx), 0)

  const invCos = ds.companies.filter((c) => c.type === 'Investment Co')
  const byCompany = invCos.map((co) => ({ key: co.id, label: co.name, value: sumAED((c) => c.companyId === co.id), color: ENTITY_COLOR[co.id] }))
  const byProduct = ds.products.map((p) => ({ key: p.id, label: p.name, value: sumAED((c) => c.productId === p.id), color: ENTITY_COLOR[p.id], sub: `${(p.monthlyProfitPct * 100).toFixed(2)}% / month · ${p.payoutFrequency.toLowerCase()} payout` }))
  const byCountry = ds.countries.map((co) => ({ key: co.code, label: co.name, value: sumAED((c) => ctx.investorById.get(c.investorId)?.country === co.code), color: ENTITY_COLOR[co.code] }))
  const byCur = CURRENCIES.map((cur) => {
    const rows = active.filter((c) => c.currency === cur)
    return { cur, original: rows.reduce((s, c) => s + c.amount, 0), aed: rows.reduce((s, c) => s + contractAED(c, ctx), 0), n: rows.length }
  })
  const totalActive = byCur.reduce((s, r) => s + r.aed, 0)

  const matrix = invCos.map((co) => ({ co, cells: ds.products.map((p) => sumAED((c) => c.companyId === co.id && c.productId === p.id)) }))
  const maxCell = Math.max(1, ...matrix.flatMap((m) => m.cells))

  // Concentration risk: top 10 investors by active capital
  const perInv = new Map<string, number>()
  for (const c of active) perInv.set(c.investorId, (perInv.get(c.investorId) ?? 0) + contractAED(c, ctx))
  const top = [...perInv.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  const top10Share = top.reduce((s, [, v]) => s + v, 0) / (totalActive || 1)

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Investments" subtitle="Where the money came from: by company, product, country and currency" />

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <Kpi label="Total investment received" accent="gold"><MoneyView m={k.totalInvestment} size="xl" /></Kpi>
        <Kpi label="Active capital" sub={`${active.length} active contracts`}><MoneyView m={k.activeCapital} size="xl" /></Kpi>
        <Kpi label="New this month" sub={`${k.newThisMonth.length} contracts`}><MoneyView m={k.newMoney} size="xl" /></Kpi>
        <Kpi label="Matured this month" sub={`${matured.length} contracts closed`}><MoneyView m={sumMoney(matured, (c) => c.amount, (c) => c.currency, (c) => c.endDate, ctx)} size="xl" /></Kpi>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card title="By investment company" subtitle="Active capital · AED · click to filter">
          <BarList rows={byCompany} onClick={(id) => toggleFilter('companyIds', id)} />
        </Card>
        <Card title="By product" subtitle="Active capital · AED · click to filter">
          <BarList rows={byProduct} onClick={(id) => toggleFilter('productIds', id)} />
        </Card>
        <Card title="By country" subtitle="Investor residence · AED · click to filter">
          <BarList rows={byCountry} onClick={(id) => toggleFilter('countries', id)} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
        <Card className="xl:col-span-3" title="New vs matured investment" subtitle="Last 12 months · AED">
          <Legend items={[{ label: 'New investment', color: C.c1, dash: true }, { label: 'Matured (capital due back)', color: C.c2, dash: true }]} />
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={series} margin={{ left: -8, right: 8, top: 6 }}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m)} tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtAxis} tick={axisTick} axisLine={false} tickLine={false} width={48} />
                <Tooltip content={<Tip labelFmt={(l) => monthLabel(String(l), 'long')} />} />
                <Line type="monotone" dataKey="investment" name="New investment" stroke={C.c1} strokeWidth={2} dot={{ r: 3, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="matured" name="Matured" stroke={C.c2} strokeWidth={2} dot={{ r: 3, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="xl:col-span-2" title="By currency" subtitle="Original amount and AED value of active capital">
          <SplitBar parts={byCur.map((r) => ({ label: r.cur, value: r.aed, color: ENTITY_COLOR[r.cur] }))} />
          <TableWrap max="">
            <table className="tbl mt-4">
              <thead><tr><th>Currency</th><th className="r">Contracts</th><th className="r">Original</th><th className="r">AED</th></tr></thead>
              <tbody>
                {byCur.map((r) => (
                  <tr key={r.cur}><td className="font-medium">{r.cur}</td><td className="r">{r.n}</td><td className="r">{full(r.original)}</td><td className="r font-semibold">{full(r.aed)}</td></tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
        <Card className="xl:col-span-3" title="Company × product matrix" subtitle="Active capital · AED · darker = larger">
          <TableWrap max="">
            <table className="tbl">
              <thead><tr><th>Company</th>{ds.products.map((p) => <th key={p.id} className="r">{p.name}</th>)}<th className="r">Total</th></tr></thead>
              <tbody>
                {matrix.map((m) => (
                  <tr key={m.co.id}>
                    <td className="font-medium">{m.co.name}</td>
                    {m.cells.map((v, i) => (
                      <td key={i} className="r" style={{ background: `rgba(184,134,42,${0.06 + (v / maxCell) * 0.42})` }} title={`AED ${full(v)}`}>{compact(v, 2)}</td>
                    ))}
                    <td className="r font-semibold">{compact(m.cells.reduce((a, b) => a + b, 0), 2)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="font-semibold">Total</td>
                  {ds.products.map((_, i) => <td key={i} className="r font-semibold">{compact(matrix.reduce((s, m) => s + m.cells[i], 0), 2)}</td>)}
                  <td className="r font-semibold">{compact(totalActive, 2)}</td>
                </tr>
              </tbody>
            </table>
          </TableWrap>
        </Card>
        <Card className="xl:col-span-2" title="Concentration: top 10 investors" subtitle={<>Top 10 hold <b className={top10Share > 0.4 ? 'text-bad' : 'text-ink'}>{pct(top10Share, 0)}</b> of active capital (alert above 40%)</>}>
          <div className="flex flex-col gap-2">
            {top.map(([id, v], i) => (
              <Link key={id} to={`/investors/${id}`} className="flex items-center gap-3 text-[0.8125rem] hover:text-gold-600">
                <span className="num w-5 text-right text-xs text-muted">{i + 1}</span>
                <span className="flex-1 truncate font-medium">{ctx.investorById.get(id)?.fullName}</span>
                <span className="num text-xs text-muted">{pct(v / totalActive, 1)}</span>
                <span className="num w-16 text-right font-semibold">{compact(v, 2)}</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Contracts funded this month" subtitle={`${k.newThisMonth.length} contracts`} pad>
        <TableWrap>
          <table className="tbl">
            <thead><tr><th>Contract</th><th>Investor</th><th>Company</th><th>Product</th><th>Start</th><th className="r">Amount</th><th className="r">AED</th><th>Salesperson</th></tr></thead>
            <tbody>
              {k.newThisMonth.map((c) => (
                <tr key={c.id}>
                  <td className="font-medium">{c.id}</td>
                  <td><Link className="hover:text-gold-600 hover:underline" to={`/investors/${c.investorId}`}>{ctx.investorById.get(c.investorId)?.fullName}</Link></td>
                  <td>{ctx.companyById.get(c.companyId)?.name}</td>
                  <td>{ctx.productById.get(c.productId)?.name}</td>
                  <td>{fmtDate(c.startDate)}</td>
                  <td className="r">{c.currency} {full(c.amount)}</td>
                  <td className="r font-semibold">{full(contractAED(c, ctx))}</td>
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
