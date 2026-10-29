import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { C, Legend, Tip, axisTick, fmtAxis } from '../components/charts'
import { Card, Kpi, MoneyView, PageHeader, Progress, StatusBadge, TableWrap } from '../components/ui'
import { homeKpis, inMonth, monthlySeries, monthsWindow, sumMoney, type ScheduleRowX } from '../data/engine'
import { useStore } from '../data/store'
import { fmtDate, monthLabel } from '../lib/dates'
import { compact, full } from '../lib/format'

const TABS = [
  ['all', 'This month'],
  ['paid', 'Paid'],
  ['pending', 'Pending'],
  ['overdue', 'Overdue (all)'],
] as const

export default function Payouts() {
  const { ctx, ds } = useStore()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') ?? 'all') as (typeof TABS)[number][0]
  const [q, setQ] = useState('')
  const k = homeKpis(ctx)
  const forward = monthlySeries(ctx, monthsWindow(ctx, -1, 6).slice(0, 6))

  const refByContractDate = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of ds.payoutsPaid) m.set(`${p.contractId}|${p.paidDate}`, p.reference)
    return m
  }, [ds])

  const monthRows = ctx.schedule.filter((r) => inMonth(r.dueDate, ctx))
  const base: ScheduleRowX[] =
    tab === 'overdue' ? k.overdueRows
      : tab === 'paid' ? monthRows.filter((r) => r.status === 'Paid')
      : tab === 'pending' ? monthRows.filter((r) => r.status !== 'Paid')
      : monthRows
  const rows = base
    .filter((r) => {
      if (!q) return true
      const c = ctx.contractById.get(r.contractId)!
      const inv = ctx.investorById.get(c.investorId)!
      return `${inv.fullName} ${inv.id} ${c.id}`.toLowerCase().includes(q.toLowerCase())
    })
    .sort((a, b) => (a.status === 'Overdue' ? -1 : 0) - (b.status === 'Overdue' ? -1 : 0) || a.dueDate.localeCompare(b.dueDate))

  const profitMonth = sumMoney(monthRows, (r) => r.profitDue, (r) => r.currency, (r) => r.dueDate, ctx)
  const capitalMonth = sumMoney(monthRows, (r) => r.capitalDue, (r) => r.currency, (r) => r.dueDate, ctx)
  const paidRatio = k.dueMonth.aed ? k.dueMonthPaid.aed / k.dueMonth.aed : 0
  const total = sumMoney(rows, (r) => r.totalDue, (r) => r.currency, (r) => r.dueDate, ctx)
  const remaining = sumMoney(rows, (r) => r.remaining, (r) => r.currency, (r) => r.dueDate, ctx)

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Payouts & Cash Due" subtitle={`${monthLabel(ctx.filters.month, 'long')} payout list, what is still pending and the cash needed for the next 6 months`} />

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <Kpi label="Due this month" accent="gold" sub={<>Profit {compact(profitMonth.aed, 2)} · Capital {compact(capitalMonth.aed, 2)}</>}><MoneyView m={k.dueMonth} size="xl" /></Kpi>
        <Kpi label="Paid" accent="good" sub={<><Progress value={paidRatio} /><span className="mt-1.5 block">{(paidRatio * 100).toFixed(0)}% of this month’s payouts settled</span></>}><MoneyView m={k.dueMonthPaid} size="xl" /></Kpi>
        <Kpi label="Still pending" sub={`${monthRows.filter((r) => r.status !== 'Paid').length} payments not settled yet`}><MoneyView m={k.dueMonthPending} size="xl" /></Kpi>
        <Kpi label="Overdue (all months)" accent="bad" sub={`${k.overdueRows.length} payments past due date`}><span className="text-bad"><MoneyView m={k.overdue} size="xl" /></span></Kpi>
      </div>

      <Card title="Cash requirement: next 6 months" subtitle="What must be paid out, from the payout schedule · AED">
        <Legend items={[{ label: 'Profit', color: C.c1 }, { label: 'Capital returns', color: C.c2 }]} />
        <div className="h-56">
          <ResponsiveContainer>
            <BarChart data={forward} margin={{ left: -8, right: 4, top: 4 }}>
              <CartesianGrid vertical={false} stroke={C.grid} />
              <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m, 'long')} tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmtAxis} tick={axisTick} axisLine={false} tickLine={false} width={48} />
              <Tooltip cursor={{ fill: 'rgba(201,162,77,0.08)' }} content={<Tip labelFmt={(l) => monthLabel(String(l), 'long')} />} />
              <Bar dataKey="profitDue" name="Profit" stackId="a" fill={C.c1} maxBarSize={44} stroke="#fff" strokeWidth={1} />
              <Bar dataKey="capitalDue" name="Capital returns" stackId="a" fill={C.c2} radius={[4, 4, 0, 0]} maxBarSize={44} stroke="#fff" strokeWidth={1} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {forward.map((m) => (
            <div key={m.month} className="rounded-xl bg-page px-3 py-2">
              <div className="text-[0.6875rem] text-muted">{monthLabel(m.month, 'long')}</div>
              <div className="num text-sm font-semibold">AED {compact(m.profitDue + m.capitalDue, 2)}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card pad={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-5">
          <div className="flex flex-wrap gap-1 rounded-xl bg-page p-1">
            {TABS.map(([id, label]) => (
              <button key={id} onClick={() => setParams(id === 'all' ? {} : { tab: id })} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${tab === id ? 'bg-navy-900 text-white' : 'text-muted hover:text-ink'}`}>
                {label}
                <span className="num ml-1.5 opacity-70">
                  {id === 'all' ? monthRows.length : id === 'paid' ? monthRows.filter((r) => r.status === 'Paid').length : id === 'pending' ? monthRows.filter((r) => r.status !== 'Paid').length : k.overdueRows.length}
                </span>
              </button>
            ))}
          </div>
          <label className="flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm sm:w-64">
            <Search size={15} className="text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search investor or contract" className="w-full bg-transparent outline-none" />
          </label>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 px-4 pt-3 text-xs text-muted sm:px-5">
          <span>{rows.length} payments</span>
          <span>Total AED <b className="num text-ink">{full(total.aed)}</b></span>
          <span>Remaining AED <b className="num text-ink">{full(remaining.aed)}</b></span>
        </div>
        <div className="p-4 sm:p-5">
          <TableWrap max="max-h-[560px]">
            <table className="tbl">
              <thead>
                <tr><th>Investor</th><th>Contract</th><th>Product</th><th>Due date</th><th className="r">Profit</th><th className="r">Capital</th><th className="r">Total due</th><th className="r">Paid</th><th className="r">Remaining</th><th>Status</th><th>Bank ref.</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const c = ctx.contractById.get(r.contractId)!
                  const inv = ctx.investorById.get(c.investorId)!
                  const late = r.status === 'Overdue' || r.status === 'Partly paid'
                  return (
                    <tr key={r.key} className={late ? 'bg-bad-bg/60' : ''}>
                      <td><Link to={`/investors/${inv.id}`} className="font-medium hover:text-gold-600 hover:underline">{inv.fullName}</Link><div className="text-[0.6875rem] text-muted">{inv.id}</div></td>
                      <td>{c.id}<div className="text-[0.6875rem] text-muted">Month {r.monthNo}/{c.tenureMonths}</div></td>
                      <td>{ctx.productById.get(c.productId)?.name}</td>
                      <td className={late ? 'font-semibold text-bad' : ''}>{fmtDate(r.dueDate)}{r.daysLate > 0 && <div className="text-[0.6875rem]">{r.daysLate} days late</div>}</td>
                      <td className="r">{full(r.profitDue)}</td>
                      <td className="r">{r.capitalDue ? full(r.capitalDue) : '—'}</td>
                      <td className="r font-semibold">{r.currency} {full(r.totalDue)}</td>
                      <td className="r text-good">{r.paid ? full(r.paid) : '—'}</td>
                      <td className={`r ${r.remaining > 0.5 ? 'font-semibold' : ''}`}>{r.remaining > 0.5 ? full(r.remaining) : '—'}</td>
                      <td><StatusBadge s={r.status} /></td>
                      <td className="text-xs text-muted">{r.lastPaidDate ? refByContractDate.get(`${c.id}|${r.lastPaidDate}`) ?? '—' : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableWrap>
        </div>
      </Card>
    </div>
  )
}
