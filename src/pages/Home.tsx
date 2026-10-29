import { AlertTriangle, ArrowRight, Banknote, CalendarClock, Cake, FileWarning, Gift, Landmark, Printer, Sparkles, TrendingUp, Users } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Link } from 'react-router-dom'
import { BarList, C, ENTITY_COLOR, Legend, SplitBar, Tip, axisTick, fmtAxis } from '../components/charts'
import { Badge, Btn, Card, Kpi, MoneyView, PageHeader, Progress, Stat } from '../components/ui'
import { contractAED, homeKpis, isActive, kycAlerts, liquidity, monthlySeries, monthsWindow, stuckLeads } from '../data/engine'
import { useStore } from '../data/store'
import { fmtDate, monthLabel } from '../lib/dates'
import { compact, full, pct } from '../lib/format'

export default function Home() {
  const { ctx, user, ds, toggleFilter } = useStore()
  const k = homeKpis(ctx)
  const series = monthlySeries(ctx, monthsWindow(ctx, 11))
  const forward = monthlySeries(ctx, monthsWindow(ctx, -1, 6).slice(0, 6))
  const liq = liquidity(ctx)
  const kyc = kycAlerts(ctx, 30)
  const stuck = stuckLeads(ctx)
  const paidRatio = k.dueMonth.aed ? k.dueMonthPaid.aed / k.dueMonth.aed : 0

  const byCountry = ds.countries.map((c) => ({
    key: c.code,
    label: c.name,
    color: ENTITY_COLOR[c.code],
    value: ctx.contracts.filter((x) => isActive(x, ctx.ref) && ctx.investorById.get(x.investorId)?.country === c.code).reduce((s, x) => s + contractAED(x, ctx), 0),
  }))
  const byCur = Object.entries(k.activeCapital.byCur).map(([cur, v]) => ({ label: cur, value: ctx.toAED(v!, cur as never, ctx.ref), color: ENTITY_COLOR[cur] }))

  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Dubai' }).format(new Date()))
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const prev = series[series.length - 2]
  const cur = series[series.length - 1]
  const invChange = prev?.investment ? (cur.investment - prev.investment) / prev.investment : 0

  const alerts = [
    ...k.birthdays.map((b) => ({ tone: 'gold' as const, icon: <Cake size={15} />, text: <><b>{b.inv.fullName}</b> birthday {b.days === 0 ? 'today' : `in ${b.days} day${b.days > 1 ? 's' : ''}`} ({fmtDate(b.inv.dateOfBirth, false)})</>, to: '/reminders' })),
    ...(k.overdueRows.length ? [{ tone: 'bad' as const, icon: <AlertTriangle size={15} />, text: <><b>{k.overdueRows.length} payouts overdue</b>, AED {full(k.overdue.aed)} unpaid after due date</>, to: '/payouts?tab=overdue' }] : []),
    ...(k.expiring.length ? [{ tone: 'warn' as const, icon: <CalendarClock size={15} />, text: <><b>{k.expiring.length} contracts mature</b> this month, AED {compact(k.expiringCapital.aed, 2)} capital to return</>, to: '/contracts' }] : []),
    ...(kyc.length ? [{ tone: 'warn' as const, icon: <FileWarning size={15} />, text: <><b>{kyc.length} KYC documents</b> expire within 30 days or have expired</>, to: '/reminders' }] : []),
    ...(stuck.length ? [{ tone: 'neutral' as const, icon: <Users size={15} />, text: <><b>{stuck.length} CRM deals</b> have had no activity for 7+ days</>, to: '/pipeline' }] : []),
    ...ds.syncLog.filter((s) => s.status !== 'OK').slice(0, 2).map((s) => ({ tone: 'neutral' as const, icon: <FileWarning size={15} />, text: <>{s.table}: {s.note}</>, to: '/data' })),
  ]

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={`${greet}, ${user?.name ?? ''}`}
        subtitle={<>{monthLabel(ctx.filters.month, 'long')} position{ctx.isCurrentMonth ? ` as of ${fmtDate(ctx.today)}` : ` (as at ${fmtDate(ctx.ref)})`} · all amounts in {ctx.filters.view === 'AED' ? 'AED' : 'original currency, with AED'}</>}
        actions={<Btn variant="ghost" icon={<Printer size={15} />} onClick={() => window.print()}>Board pack</Btn>}
      />

      {/* Smart summary */}
      <div className="flex gap-3 rounded-2xl bg-navy-900 p-4 text-sm leading-relaxed text-white/85 sm:p-5">
        <Sparkles size={18} className="mt-0.5 shrink-0 text-gold-400" />
        <p>
          <b className="text-white">AED {compact(k.newMoney.aed, 2)}</b> raised from <b className="text-white">{k.newThisMonth.length} new contracts</b> this month
          {prev ? <> ({invChange >= 0 ? 'up' : 'down'} {pct(Math.abs(invChange), 0)} on {monthLabel(prev.month, 'long')})</> : null}.{' '}
          Payouts due this month are <b className="text-white">AED {compact(k.dueMonth.aed, 2)}</b>, and <b className="text-white">{pct(paidRatio, 0)}</b> is already paid.
          {k.overdueRows.length > 0 && <> <b className="text-gold-400">{k.overdueRows.length} payments are overdue</b> (AED {compact(k.overdue.aed, 2)}).</>}{' '}
          Company commission {k.surplus >= 0 ? 'covers' : 'falls short of'} this month’s expenses by <b className="text-white">AED {compact(Math.abs(k.surplus), 2)}</b>.
          Cash covers the next 90 days of obligations <b className={liq.ratio < 1.2 ? 'text-gold-400' : 'text-white'}>{liq.ratio.toFixed(2)}×</b>.
        </p>
      </div>

      {/* KPI grid: brief §2 items 1–11 */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <Kpi label="Total investment received" icon={<Landmark size={16} />} to="/investments" accent="gold" sub={<>+ AED {compact(k.newMoney.aed, 2)} this month</>}>
          <MoneyView m={k.totalInvestment} size="xl" />
        </Kpi>
        <Kpi label="Total payouts made to date" icon={<Banknote size={16} />} to="/payouts" sub="Profit + capital returned, from bank references">
          <MoneyView m={k.payoutsToDate} size="xl" />
        </Kpi>
        <Kpi label="Payout due this month" icon={<CalendarClock size={16} />} to="/payouts">
          <MoneyView m={k.dueMonth} size="xl" />
          <div className="mt-2.5"><Progress value={paidRatio} /></div>
          <div className="mt-2 flex justify-between text-xs">
            <span className="text-good">Paid <b className="num">{compact(k.dueMonthPaid.aed, 2)}</b></span>
            <span className="text-warn">Pending <b className="num">{compact(k.dueMonthPending.aed, 2)}</b></span>
          </div>
        </Kpi>
        <Kpi label="Overdue payouts" icon={<AlertTriangle size={16} />} to="/payouts?tab=overdue" accent={k.overdueRows.length ? 'bad' : 'good'} sub={k.overdueRows.length ? `${k.overdueRows.length} payments past due date (included in pending)` : 'Nothing overdue'}>
          <span className={k.overdueRows.length ? 'text-bad' : ''}><MoneyView m={k.overdue} size="xl" /></span>
        </Kpi>

        <Kpi label="Active investors · contracts" icon={<Users size={16} />} to="/investors" sub={<>Active capital AED {compact(k.activeCapital.aed, 2)}</>}>
          <span className="num text-2xl font-semibold sm:text-3xl">{k.activeInvestors}</span>
          <span className="num ml-2 text-lg font-medium text-muted">· {k.activeContracts}</span>
        </Kpi>
        <Kpi label="New contracts this month" icon={<TrendingUp size={16} />} to="/contracts" sub={<>{k.newThisMonth.length} contracts</>}>
          <MoneyView m={k.newMoney} size="xl" />
        </Kpi>
        <Kpi label="Contracts expiring this month" icon={<CalendarClock size={16} />} to="/contracts" sub={<>{k.expiring.length} contracts · capital to return</>}>
          <MoneyView m={k.expiringCapital} size="xl" />
        </Kpi>
        <Kpi label="Internal investment in sub-companies" icon={<Landmark size={16} />} to="/internal" sub="Net of repayments, to date">
          <MoneyView m={k.internalTotal} size="xl" />
        </Kpi>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Kpi label="Company commission (income)" to="/commission">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="This month" value={compact(k.comm.month.aed, 2)} />
            <Stat label="To date" value={compact(k.comm.toDate.aed, 2)} />
            <Stat label="Still to earn" value={compact(k.comm.toEarn.aed, 2)} />
          </div>
          <div className="mt-3 flex items-center justify-between rounded-xl bg-page px-3 py-2 text-xs">
            <span className="text-muted">vs expenses this month (AED {compact(k.exp.total + k.crm.month.aed, 2)})</span>
            <Badge tone={k.surplus >= 0 ? 'good' : 'bad'}>{k.surplus >= 0 ? 'Surplus' : 'Shortfall'} {compact(Math.abs(k.surplus), 2)}</Badge>
          </div>
        </Kpi>
        <Kpi label="CRM & freelancer commission (AED)" to="/sales">
          <div className="grid grid-cols-4 gap-2">
            <Stat label="Earned" value={compact(k.crm.earned, 1)} />
            <Stat label="Paid" value={compact(k.crm.paid, 1)} tone="good" />
            <Stat label="Payable" value={compact(k.crm.payable, 1)} tone="warn" />
            <Stat label="Potential" value={compact(k.crm.potential, 1)} />
          </div>
          <div className="mt-3 text-xs text-muted">Potential = open pipeline × each person’s %</div>
        </Kpi>
        <Kpi label="Birthdays in next 2 days" icon={<Gift size={16} />} to="/reminders" accent={k.birthdays.length ? 'gold' : undefined}>
          {k.birthdays.length ? (
            <div className="flex flex-col gap-1.5">
              {k.birthdays.map((b) => (
                <div key={b.inv.id} className="flex items-center justify-between text-sm">
                  <span className="truncate font-medium">{b.inv.fullName}</span>
                  <Badge tone="gold">{b.days === 0 ? 'Today' : b.days === 1 ? 'Tomorrow' : `In ${b.days} days`}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-sm text-muted">No birthdays in the next 2 days</span>
          )}
        </Kpi>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Monthly investment vs payouts" subtitle="Last 12 months · AED">
          <Legend items={[{ label: 'New investment', color: C.c1 }, { label: 'Payouts made', color: C.c2 }]} />
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={series} barGap={2} margin={{ left: -8, right: 4, top: 4 }}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m)} tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtAxis} tick={axisTick} axisLine={false} tickLine={false} width={48} />
                <Tooltip cursor={{ fill: 'rgba(201,162,77,0.08)' }} content={<Tip labelFmt={(l) => monthLabel(String(l), 'long')} />} />
                <Bar dataKey="investment" name="New investment" fill={C.c1} radius={[4, 4, 0, 0]} maxBarSize={18} />
                <Bar dataKey="payouts" name="Payouts made" fill={C.c2} radius={[4, 4, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Today’s alerts" subtitle={`${alerts.length} items need attention`} action={<Link to="/reminders" className="text-xs font-medium text-gold-600 hover:underline">All</Link>}>
          <div className="flex flex-col divide-y divide-line-2">
            {alerts.slice(0, 7).map((a, i) => (
              <Link key={i} to={a.to} className="group flex items-start gap-2.5 py-2.5 text-[0.8125rem] first:pt-0">
                <span className={`mt-0.5 ${a.tone === 'bad' ? 'text-bad' : a.tone === 'warn' ? 'text-warn' : a.tone === 'gold' ? 'text-gold-600' : 'text-muted'}`}>{a.icon}</span>
                <span className="flex-1 text-ink-2">{a.text}</span>
                <ArrowRight size={14} className="mt-0.5 text-muted opacity-0 transition group-hover:opacity-100" />
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card title="Active capital by country" subtitle="AED · click a country to filter every page">
          <BarList rows={byCountry} onClick={(code) => toggleFilter('countries', code)} />
        </Card>
        <Card title="Active capital by currency" subtitle="Share of AED value">
          <SplitBar parts={byCur} />
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            {Object.entries(k.activeCapital.byCur).map(([c, v]) => (
              <div key={c} className="flex justify-between rounded-lg bg-page px-2.5 py-1.5"><span className="text-muted">{c}</span><span className="num font-semibold">{compact(v!, 2)}</span></div>
            ))}
          </div>
        </Card>
        <Card title="Cash needed: next 6 months" subtitle="Scheduled profit + capital returns · AED" action={<Link to="/cash" className="text-xs font-medium text-gold-600 hover:underline">Forecast</Link>}>
          <Legend items={[{ label: 'Profit', color: C.c1 }, { label: 'Capital', color: C.c2 }]} />
          <div className="h-44">
            <ResponsiveContainer>
              <BarChart data={forward} margin={{ left: -8, right: 4, top: 4 }}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m)} tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtAxis} tick={axisTick} axisLine={false} tickLine={false} width={48} />
                <Tooltip cursor={{ fill: 'rgba(201,162,77,0.08)' }} content={<Tip labelFmt={(l) => monthLabel(String(l), 'long')} />} />
                <Bar dataKey="profitDue" name="Profit" stackId="a" fill={C.c1} maxBarSize={26} stroke="#fff" strokeWidth={1} />
                <Bar dataKey="capitalDue" name="Capital" stackId="a" fill={C.c2} radius={[4, 4, 0, 0]} maxBarSize={26} stroke="#fff" strokeWidth={1} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  )
}
