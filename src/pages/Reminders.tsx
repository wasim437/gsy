import { AlertTriangle, Cake, CalendarClock, FileWarning, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Card, Empty, PageHeader } from '../components/ui'
import { homeKpis, kycAlerts, stuckLeads, upcomingBirthdays } from '../data/engine'
import { useStore } from '../data/store'
import { addDays, daysBetween, fmtDate } from '../lib/dates'
import { full } from '../lib/format'

export default function Reminders() {
  const { ctx } = useStore()
  const k = homeKpis(ctx)
  const bdays = upcomingBirthdays(ctx, 14)
  const kyc = kycAlerts(ctx, 30)
  const stuck = stuckLeads(ctx)
  const expiring = ctx.contracts.filter((c) => c.endDate >= ctx.ref && c.endDate <= addDays(ctx.ref, 30)).sort((a, b) => a.endDate.localeCompare(b.endDate))
  const late = k.overdueRows.filter((r) => r.daysLate >= 2).sort((a, b) => b.daysLate - a.daysLate)

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Reminders & Alerts" subtitle="Everything that needs a person to act. The same alerts go out by email each day." />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Section icon={<AlertTriangle size={16} />} tone="bad" title="Payout delays" sub="Not paid within 2 days of due date · goes to Finance and Chairman" count={late.length}>
          {late.map((r) => {
            const c = ctx.contractById.get(r.contractId)!
            return <Item key={r.key} left={<Link to={`/investors/${c.investorId}`} className="font-medium hover:underline">{ctx.investorById.get(c.investorId)?.fullName}</Link>} mid={`${c.id} · due ${fmtDate(r.dueDate)}`} right={<><span className="num font-semibold">{r.currency} {full(r.remaining)}</span><Badge tone="bad">{r.daysLate}d late</Badge></>} />
          })}
        </Section>
        <Section icon={<Cake size={16} />} tone="gold" title="Birthdays" sub="Next 14 days · gift reminder 2 days before" count={bdays.length}>
          {bdays.map((b) => <Item key={b.inv.id} left={<Link to={`/investors/${b.inv.id}`} className="font-medium hover:underline">{b.inv.fullName}</Link>} mid={`${fmtDate(b.inv.dateOfBirth, false)} · ${b.inv.city} · ${ctx.salesById.get(b.inv.assignedSalesId)?.name}`} right={<Badge tone={b.days <= 2 ? 'gold' : 'neutral'}>{b.days === 0 ? 'Today' : `In ${b.days} days`}</Badge>} />)}
        </Section>
        <Section icon={<CalendarClock size={16} />} tone="warn" title="Contracts maturing" sub="Next 30 days · capital to return" count={expiring.length}>
          {expiring.map((c) => <Item key={c.id} left={<Link to={`/investors/${c.investorId}`} className="font-medium hover:underline">{ctx.investorById.get(c.investorId)?.fullName}</Link>} mid={`${c.id} · ${fmtDate(c.endDate)} · ${c.renewalStatus}`} right={<><span className="num font-semibold">{c.currency} {full(c.amount)}</span><Badge tone="warn">{daysBetween(ctx.ref, c.endDate)}d</Badge></>} />)}
        </Section>
        <Section icon={<FileWarning size={16} />} tone="warn" title="KYC documents expiring" sub="Passport and Emirates ID · 30 days before" count={kyc.length}>
          {kyc.map((x) => <Item key={x.inv.id + x.doc} left={<Link to={`/investors/${x.inv.id}`} className="font-medium hover:underline">{x.inv.fullName}</Link>} mid={`${x.doc} · ${fmtDate(x.expiry)}`} right={<Badge tone={x.days < 0 ? 'bad' : 'warn'}>{x.days < 0 ? `Expired ${-x.days}d ago` : `In ${x.days}d`}</Badge>} />)}
        </Section>
        <Section icon={<Users size={16} />} tone="neutral" title="Inactive CRM deals" sub="No activity for 7 days · goes to salesperson and MD" count={stuck.length}>
          {stuck.slice(0, 12).map((l) => <Item key={l.id} left={<span className="font-medium">{l.name}</span>} mid={`${l.stage} · ${ctx.salesById.get(l.salesId)?.name}`} right={<Badge tone="neutral">{daysBetween(l.lastActivityDate, ctx.ref)}d idle</Badge>} />)}
        </Section>
      </div>
    </div>
  )
}

function Section({ icon, title, sub, count, tone, children }: { icon: ReactNode; title: string; sub: string; count: number; tone: 'bad' | 'warn' | 'gold' | 'neutral'; children: ReactNode }) {
  const c = { bad: 'text-bad bg-bad-bg', warn: 'text-warn bg-warn-bg', gold: 'text-gold-600 bg-gold-100', neutral: 'text-ink-2 bg-line-2' }[tone]
  return (
    <Card title={<span className="flex items-center gap-2"><span className={`grid h-7 w-7 place-items-center rounded-lg ${c}`}>{icon}</span>{title}<span className="num text-muted">({count})</span></span>} subtitle={sub}>
      <div className="flex max-h-80 flex-col divide-y divide-line-2 overflow-auto">{count ? children : <Empty>Nothing to action.</Empty>}</div>
    </Card>
  )
}

function Item({ left, mid, right }: { left: ReactNode; mid: ReactNode; right: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
      <div className="min-w-0"><div className="truncate">{left}</div><div className="truncate text-xs text-muted">{mid}</div></div>
      <div className="flex shrink-0 items-center gap-2">{right}</div>
    </div>
  )
}
