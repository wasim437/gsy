import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { C, Legend, Tip, axisTick, fmtAxis } from '../components/charts'
import { Card, Kpi, PageHeader, StatusBadge, TableWrap } from '../components/ui'
import { contractAED, liquidity, monthlySeries, monthsWindow } from '../data/engine'
import { useStore } from '../data/store'
import { addDays, fmtDate, monthLabel } from '../lib/dates'
import { compact, full } from '../lib/format'

export default function CashFlow() {
  const { ctx, ds } = useStore()
  const liq = liquidity(ctx)
  const hist = monthlySeries(ctx, monthsWindow(ctx, 5))
  const avgNew = hist.reduce((s, m) => s + m.investment, 0) / hist.length
  const fwd = monthlySeries(ctx, monthsWindow(ctx, -1, 12).slice(0, 12)).map((m) => {
    const outflow = m.profitDue + m.capitalDue + m.crmComm
    const inflow = avgNew + m.companyComm
    return { ...m, outflow, inflow, net: inflow - outflow }
  })
  const short = fwd.filter((m) => m.net < 0)

  // Daily cash movement: last 14 days, money in (new investments) vs money out (payouts + commissions)
  const days = Array.from({ length: 14 }, (_, i) => addDays(ctx.ref, i - 13))
  const moves: { date: string; dir: 'In' | 'Out'; what: string; who: string; amount: number; cur: string; aed: number; ref: string; status: string }[] = []
  for (const c of ctx.contracts) if (c.startDate >= days[0] && c.startDate <= ctx.ref) moves.push({ date: c.startDate, dir: 'In', what: 'Investment received', who: ctx.investorById.get(c.investorId)!.fullName, amount: c.amount, cur: c.currency, aed: contractAED(c, ctx), ref: `RCV-${c.id}`, status: 'Settled' })
  for (const p of ds.payoutsPaid) if (ctx.contractIds.has(p.contractId) && p.paidDate >= days[0] && p.paidDate <= ctx.ref) moves.push({ date: p.paidDate, dir: 'Out', what: 'Investor payout', who: ctx.investorById.get(ctx.contractById.get(p.contractId)!.investorId)!.fullName, amount: p.amount, cur: p.currency, aed: ctx.toAED(p.amount, p.currency, p.paidDate), ref: p.reference, status: 'Settled' })
  for (const p of ds.commissionsPaid) if (ctx.contractIds.has(p.contractId) && p.paidDate >= days[0] && p.paidDate <= ctx.ref) moves.push({ date: p.paidDate, dir: 'Out', what: 'Commission paid', who: ctx.salesById.get(p.salesId)!.name, amount: p.amount, cur: p.currency, aed: ctx.toAED(p.amount, p.currency, p.paidDate), ref: p.reference, status: 'Settled' })
  moves.sort((a, b) => b.date.localeCompare(a.date))
  const daily = days.map((d) => ({ date: d, In: Math.round(moves.filter((m) => m.date === d && m.dir === 'In').reduce((s, m) => s + m.aed, 0)), Out: Math.round(moves.filter((m) => m.date === d && m.dir === 'Out').reduce((s, m) => s + m.aed, 0)) }))

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Cash Flow & Risk" subtitle="Daily money in and out, liquidity cover and a 12-month forecast of where cash gets tight" />
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <Kpi label="Liquidity cover (90 days)" accent={liq.ratio >= 1.2 ? 'good' : 'bad'} sub="Bank balance ÷ obligations due in 90 days (red below 1.2×)">
          <span className={`num text-2xl font-semibold sm:text-3xl ${liq.ratio >= 1.2 ? 'text-good' : 'text-bad'}`}>{liq.ratio.toFixed(2)}×</span>
        </Kpi>
        <Kpi label="Bank balance (all accounts)" sub={`As of ${fmtDate(ds.bankBalances[0].asOf)}`}><Big v={liq.cash} /></Kpi>
        <Kpi label="Obligations next 90 days" sub="Profit + capital + overdue"><Big v={liq.obligations} /></Kpi>
        <Kpi label="Months with cash gap (12 mo)" accent={short.length ? 'bad' : 'good'} sub={short.length ? short.map((m) => monthLabel(m.month)).join(', ') : 'No shortfall forecast'}><span className="num text-2xl font-semibold sm:text-3xl">{short.length}</span></Kpi>
      </div>

      <Card title="Daily cash movement" subtitle="Last 14 days · AED · money in = new investments, money out = payouts + commissions">
        <Legend items={[{ label: 'Money in', color: C.c3 }, { label: 'Money out', color: C.c4 }]} />
        <div className="h-56">
          <ResponsiveContainer>
            <BarChart data={daily} barGap={2} margin={{ left: -8, right: 4, top: 4 }}>
              <CartesianGrid vertical={false} stroke={C.grid} />
              <XAxis dataKey="date" tickFormatter={(d) => fmtDate(d, false)} tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmtAxis} tick={axisTick} axisLine={false} tickLine={false} width={48} />
              <Tooltip cursor={{ fill: 'rgba(201,162,77,0.08)' }} content={<Tip labelFmt={(l) => fmtDate(String(l))} />} />
              <Bar dataKey="In" name="Money in" fill={C.c3} radius={[4, 4, 0, 0]} maxBarSize={16} />
              <Bar dataKey="Out" name="Money out" fill={C.c4} radius={[4, 4, 0, 0]} maxBarSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <TableWrap max="max-h-[360px]">
          <table className="tbl mt-4">
            <thead><tr><th>Date</th><th>Direction</th><th>Type</th><th>Party</th><th className="r">Amount</th><th className="r">AED</th><th>Bank reference</th><th>Status</th></tr></thead>
            <tbody>
              {moves.map((m, i) => (
                <tr key={i}>
                  <td>{fmtDate(m.date)}</td>
                  <td className={m.dir === 'In' ? 'font-semibold text-good' : 'font-semibold text-bad'}>{m.dir === 'In' ? '↓ In' : '↑ Out'}</td>
                  <td>{m.what}</td><td>{m.who}</td>
                  <td className="r">{m.cur} {full(m.amount)}</td><td className="r font-semibold">{full(m.aed)}</td>
                  <td className="text-muted">{m.ref}</td><td><StatusBadge s={m.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      <Card title="12-month cash forecast" subtitle={`AED · inflow = avg new investment (${compact(avgNew, 2)}/mo) + company commission · outflow = profit + capital + CRM commission`}>
        <Legend items={[{ label: 'Expected inflow', color: C.c3 }, { label: 'Scheduled outflow', color: C.c4 }]} />
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={fwd} barGap={2} margin={{ left: -8, right: 4, top: 4 }}>
              <CartesianGrid vertical={false} stroke={C.grid} />
              <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m)} tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmtAxis} tick={axisTick} axisLine={false} tickLine={false} width={48} />
              <ReferenceLine y={0} stroke={C.axis} />
              <Tooltip cursor={{ fill: 'rgba(201,162,77,0.08)' }} content={<Tip labelFmt={(l) => monthLabel(String(l), 'long')} />} />
              <Bar dataKey="inflow" name="Expected inflow" fill={C.c3} radius={[4, 4, 0, 0]} maxBarSize={18} />
              <Bar dataKey="outflow" name="Scheduled outflow" fill={C.c4} radius={[4, 4, 0, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-12">
          {fwd.map((m) => (
            <div key={m.month} className={`rounded-lg px-2 py-1.5 text-center ${m.net < 0 ? 'bg-bad-bg' : 'bg-good-bg'}`}>
              <div className="text-[0.625rem] text-muted">{monthLabel(m.month)}</div>
              <div className={`num text-xs font-semibold ${m.net < 0 ? 'text-bad' : 'text-good'}`}>{m.net < 0 ? '−' : '+'}{compact(Math.abs(m.net), 1)}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Bank balances" subtitle="Source for liquidity cover">
        <TableWrap max="">
          <table className="tbl">
            <thead><tr><th>Account</th><th>Currency</th><th className="r">Balance</th><th className="r">AED</th><th>As of</th></tr></thead>
            <tbody>{ds.bankBalances.map((b) => <tr key={b.account}><td className="font-medium">{b.account}</td><td>{b.currency}</td><td className="r">{full(b.balance)}</td><td className="r font-semibold">{full(ctx.toAED(b.balance, b.currency, b.asOf))}</td><td>{fmtDate(b.asOf)}</td></tr>)}</tbody>
          </table>
        </TableWrap>
      </Card>
    </div>
  )
}

function Big({ v }: { v: number }) {
  return <span className="num text-2xl font-semibold"><span className="mr-1 text-xs text-muted">AED</span>{compact(v, 2)}</span>
}
