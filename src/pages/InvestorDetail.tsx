import { ArrowLeft, Cake, Download, FileText, FolderOpen, Mail, Phone, UserRound } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { C, Legend, Tip, axisTick, fmtAxis } from '../components/charts'
import { Badge, Card, Empty, Kpi, MoneyView, Progress, StatusBadge, TableWrap } from '../components/ui'
import { contractAED, investorSummary, segmentOf } from '../data/engine'
import { useStore } from '../data/store'
import { daysBetween, daysToBirthday, fmtDate, monthKey, monthLabel } from '../lib/dates'
import { full, pct } from '../lib/format'

export default function InvestorDetail() {
  const { id = '' } = useParams()
  const { ctx } = useStore()
  const inv = ctx.investorById.get(id)
  if (!inv) return <Empty>Investor not found.</Empty>
  const s = investorSummary(ctx, id)
  const seg = segmentOf(s.invested.aed)
  const sp = ctx.salesById.get(inv.assignedSalesId)

  // Growth chart: cumulative scheduled profit vs profit actually received, by month (AED).
  const byMonth = new Map<string, { scheduled: number; received: number }>()
  for (const r of [...s.rows].sort((a, b) => a.dueDate.localeCompare(b.dueDate))) {
    const k = monthKey(r.dueDate)
    const e = byMonth.get(k) ?? { scheduled: 0, received: 0 }
    e.scheduled += ctx.toAED(r.profitDue, r.currency, r.dueDate)
    e.received += ctx.toAED(Math.min(r.paid, r.profitDue), r.currency, r.dueDate)
    byMonth.set(k, e)
  }
  let cs = 0
  let cr = 0
  const growth = [...byMonth.entries()].sort().map(([month, v]) => {
    cs += v.scheduled
    cr += v.received
    return { month, scheduled: Math.round(cs), received: month <= monthKey(ctx.ref) ? Math.round(cr) : null }
  })
  const bday = inv.dateOfBirth ? daysToBirthday(inv.dateOfBirth, ctx.today) : null

  return (
    <div className="flex flex-col gap-5">
      <Link to="/investors" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={15} /> All investors</Link>

      <div className="flex flex-col gap-4 rounded-2xl bg-navy-900 p-5 text-white sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gold-500 text-lg font-bold text-navy-950">{inv.fullName.split(' ').map((w) => w[0]).slice(0, 2).join('')}</div>
          <div>
            <h1 className="text-xl font-semibold sm:text-2xl">{inv.fullName}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/60">
              <span>{inv.id}</span>·<span>{inv.city}, {ctx.ds.countries.find((c) => c.code === inv.country)?.name}</span>
              <Badge tone={seg === 'Platinum' ? 'gold' : 'neutral'}>{seg}</Badge>
              <StatusBadge s={inv.kycStatus} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/statement/${inv.id}`} className="inline-flex items-center gap-1.5 rounded-xl bg-gold-500 px-3.5 py-2 text-sm font-semibold text-navy-950 hover:bg-gold-400"><Download size={15} /> Download statement</Link>
          <a href={inv.documentFolderLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 px-3.5 py-2 text-sm hover:bg-white/10"><FolderOpen size={15} /> KYC & documents</a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-5">
        <Kpi label="Amount invested" accent="gold"><MoneyView m={s.invested} size="lg" /></Kpi>
        <Kpi label="Profit paid"><MoneyView m={s.profitPaid} size="lg" /></Kpi>
        <Kpi label="Profit remaining"><MoneyView m={s.profitRemaining} size="lg" /></Kpi>
        <Kpi label="Overdue / unpaid" accent={s.outstanding.aed > 0.5 ? 'bad' : 'good'}><span className={s.outstanding.aed > 0.5 ? 'text-bad' : ''}><MoneyView m={s.outstanding} size="lg" /></span></Kpi>
        <Kpi label="Next payout" sub={s.next ? `${s.next.contractId} · month ${s.next.monthNo}` : undefined}>
          {s.next ? <><div className="num text-lg font-semibold">{s.next.currency} {full(s.next.totalDue)}</div><div className="text-xs text-muted">{fmtDate(s.next.dueDate)} · in {daysBetween(ctx.ref, s.next.dueDate)} days</div></> : <span className="text-sm text-muted">No upcoming payouts</span>}
        </Kpi>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Card title="Profile">
          <dl className="grid grid-cols-1 gap-3 text-sm">
            <Row icon={<Phone size={14} />} k="Phone" v={inv.phone} />
            <Row icon={<Mail size={14} />} k="Email" v={inv.email} />
            <Row icon={<Cake size={14} />} k="Date of birth" v={inv.dateOfBirth ? <>{fmtDate(inv.dateOfBirth)} {bday !== null && bday <= 7 && <Badge tone="gold">Birthday in {bday}d</Badge>}</> : <Badge tone="warn">Missing</Badge>} />
            <Row icon={<FileText size={14} />} k="Passport" v={<>{inv.passportNo.slice(0, 2)}•••••{inv.passportNo.slice(-2)} · exp. {fmtDate(inv.passportExpiry)}</>} />
            {inv.emiratesIdExpiry && <Row icon={<FileText size={14} />} k="Emirates ID expiry" v={fmtDate(inv.emiratesIdExpiry)} />}
            <Row icon={<UserRound size={14} />} k="Salesperson" v={<>{sp?.name} <span className="text-muted">({sp?.type})</span></>} />
          </dl>
        </Card>
        <Card className="xl:col-span-2" title="Portfolio growth" subtitle="Cumulative profit · AED · scheduled vs actually received">
          <Legend items={[{ label: 'Scheduled profit', color: C.c2, dash: true }, { label: 'Profit received', color: C.c1, dash: true }]} />
          <div className="h-60">
            <ResponsiveContainer>
              <AreaChart data={growth} margin={{ left: -8, right: 8, top: 6 }}>
                <defs>
                  <linearGradient id="gRecv" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.c1} stopOpacity={0.25} /><stop offset="100%" stopColor={C.c1} stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m)} tick={axisTick} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis tickFormatter={fmtAxis} tick={axisTick} axisLine={false} tickLine={false} width={48} />
                <Tooltip content={<Tip labelFmt={(l) => monthLabel(String(l), 'long')} />} />
                <ReferenceLine x={monthKey(ctx.ref)} stroke={C.axis} strokeDasharray="3 3" label={{ value: 'Today', fontSize: 10, fill: C.axis, position: 'top' }} />
                <Area type="monotone" dataKey="scheduled" name="Scheduled profit" stroke={C.c2} strokeWidth={2} strokeDasharray="5 4" fill="none" />
                <Area type="monotone" dataKey="received" name="Profit received" stroke={C.c1} strokeWidth={2} fill="url(#gRecv)" connectNulls={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-[0.9375rem] font-semibold">Contracts ({s.contracts.length})</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {s.perContract.map(({ c, monthsCompleted, monthsPending, active }) => {
            const p = ctx.productById.get(c.productId)!
            return (
              <div key={c.id} className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm font-semibold">{c.id} · {p.name}</div>
                    <div className="text-xs text-muted">{ctx.companyById.get(c.companyId)?.name}</div>
                  </div>
                  <StatusBadge s={active ? 'Active' : c.startDate > ctx.ref ? 'Upcoming' : 'Matured'} />
                </div>
                <div className="num mt-3 text-2xl font-semibold">{c.currency} {full(c.amount)}</div>
                <div className="text-xs text-muted">≈ AED {full(contractAED(c, ctx))} · {pct(c.monthlyProfitPct, 2)} / month · {p.payoutFrequency}</div>
                <div className="mt-3"><Progress value={monthsCompleted / c.tenureMonths} tone="gold" /></div>
                <div className="mt-1.5 flex justify-between text-xs"><span><b className="num">{monthsCompleted}</b> months completed</span><span className="text-muted"><b className="num text-ink">{monthsPending}</b> pending</span></div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-page px-2.5 py-1.5"><div className="text-muted">Start</div><div className="font-medium">{fmtDate(c.startDate)}</div></div>
                  <div className="rounded-lg bg-page px-2.5 py-1.5"><div className="text-muted">Maturity</div><div className="font-medium">{fmtDate(c.endDate)}</div></div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  {c.renewalStatus !== '—' ? <span>Renewal: <StatusBadge s={c.renewalStatus} /></span> : <span />}
                  {c.contractPdfLink ? <a href={c.contractPdfLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-gold-600 hover:underline"><FileText size={13} /> Contract PDF</a> : <Badge tone="warn">PDF missing</Badge>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <Card title="Payout schedule & history" subtitle="Every scheduled payment, what was paid and when">
        <TableWrap max="max-h-[480px]">
          <table className="tbl">
            <thead><tr><th>Due date</th><th>Contract</th><th className="r">Month</th><th className="r">Profit</th><th className="r">Capital</th><th className="r">Paid</th><th>Paid on</th><th>Status</th></tr></thead>
            <tbody>
              {[...s.rows].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((r) => (
                <tr key={r.key} className={r.status === 'Overdue' || r.status === 'Partly paid' ? 'bg-bad-bg/60' : r.dueDate > ctx.ref ? 'text-muted' : ''}>
                  <td>{fmtDate(r.dueDate)}</td>
                  <td>{r.contractId}</td>
                  <td className="r">{r.monthNo}</td>
                  <td className="r">{r.currency} {full(r.profitDue)}</td>
                  <td className="r">{r.capitalDue ? full(r.capitalDue) : '—'}</td>
                  <td className="r">{r.paid ? full(r.paid) : '—'}</td>
                  <td>{fmtDate(r.lastPaidDate)}</td>
                  <td><StatusBadge s={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </div>
  )
}

function Row({ icon, k, v }: { icon: React.ReactNode; k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-muted">{icon}</span>
      <div className="min-w-0"><dt className="text-[0.6875rem] text-muted">{k}</dt><dd className="truncate font-medium">{v}</dd></div>
    </div>
  )
}
