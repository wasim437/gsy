import { Clock, Mail, Send } from 'lucide-react'
import { useState } from 'react'
import { Badge, Card, PageHeader } from '../components/ui'
import { crmCommission, filteredLeads, homeKpis, stuckLeads, upcomingBirthdays } from '../data/engine'
import { useStore } from '../data/store'
import { addDays, fmtDate } from '../lib/dates'
import { compact, full } from '../lib/format'
import { OPEN_STAGES } from '../data/types'

const SCHEDULE = [
  { id: 'daily', name: 'Daily financial report', time: '21:00', to: 'Chairman, Vice Chairman, MD', content: 'New investments, payouts made, CRM activity, deals closed, expenses, cash due tomorrow' },
  { id: 'morning', name: 'Morning pipeline brief', time: '08:00', to: 'Chairman, MD', content: 'Pipeline by stage, yesterday’s leads, deals closing this week, stuck deals, payouts due this week' },
  { id: 'bday', name: 'Birthday gift alert', time: '09:00', to: 'Chairman’s office', content: 'Investors with a birthday in 2 days + salesperson' },
  { id: 'expiry', name: 'Expiry & payout alert', time: '1st of month + 7 days before', to: 'Chairman, Finance', content: 'Contracts ending and payouts due, per currency' },
]

export default function Reports() {
  const { ctx } = useStore()
  const [tab, setTab] = useState<'daily' | 'morning'>('daily')
  const k = homeKpis(ctx)
  const tomorrow = addDays(ctx.ref, 1)
  const dueTomorrow = ctx.schedule.filter((r) => r.dueDate === tomorrow).reduce((s, r) => s + ctx.toAED(r.totalDue, r.currency, r.dueDate), 0)
  const paidToday = ctx.ds.payoutsPaid.filter((p) => ctx.contractIds.has(p.contractId) && p.paidDate === ctx.ref)
  const newToday = ctx.contracts.filter((c) => c.startDate === ctx.ref)
  const leads = filteredLeads(ctx)
  const open = leads.filter((l) => OPEN_STAGES.includes(l.stage))
  const week = ctx.schedule.filter((r) => r.dueDate > ctx.ref && r.dueDate <= addDays(ctx.ref, 7)).reduce((s, r) => s + ctx.toAED(r.totalDue, r.currency, r.dueDate), 0)
  const crm = crmCommission(ctx)

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Daily Email Reports" subtitle="What the leadership receives by email each day. Sent only after a successful data sync, always with the sync time." />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
        <Card className="xl:col-span-2" title="Schedule (Asia/Dubai)">
          <div className="flex flex-col gap-2.5">
            {SCHEDULE.map((s) => (
              <div key={s.id} className="rounded-xl border border-line p-3">
                <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{s.name}</span><Badge tone="good">Active</Badge></div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-muted"><Clock size={12} /> {s.time} · <Mail size={12} /> {s.to}</div>
                <div className="mt-1 text-xs text-ink-2">{s.content}</div>
              </div>
            ))}
            <p className="text-xs text-muted">If a sync fails, a “data is stale” notice is sent instead of the normal report. WhatsApp delivery is optional (Business API, quoted separately).</p>
          </div>
        </Card>

        <div className="xl:col-span-3">
          <div className="mb-3 flex gap-1 rounded-xl bg-surface p-1 shadow-sm">
            {([['daily', '21:00 Daily report'], ['morning', '08:00 Morning brief']] as const).map(([id, l]) => (
              <button key={id} onClick={() => setTab(id)} className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${tab === id ? 'bg-navy-900 text-white' : 'text-muted'}`}>{l}</button>
            ))}
          </div>
          <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
            <div className="border-b border-line bg-page px-5 py-3 text-xs text-muted">
              <div><b className="text-ink">From:</b> GSY Investor Monitor &lt;reports@gsy-project&gt;</div>
              <div><b className="text-ink">Subject:</b> {tab === 'daily' ? `GSY Daily Financial Report · ${fmtDate(ctx.ref)}` : `GSY Morning Brief · ${fmtDate(ctx.ref)}`}</div>
            </div>
            <div className="px-5 py-5 sm:px-8">
              <div className="rounded-xl bg-navy-900 px-5 py-4 text-white">
                <div className="text-xs tracking-widest text-gold-400">GSY INVESTMENT GROUP</div>
                <div className="mt-1 text-lg font-semibold">{tab === 'daily' ? 'Daily Financial Report' : 'Morning Pipeline Brief'}</div>
                <div className="text-xs text-white/60">{fmtDate(ctx.ref)} · data synced 09:00</div>
              </div>
              {tab === 'daily' ? (
                <>
                  <Grid items={[
                    ['New investments today', `AED ${full(newToday.reduce((s, c) => s + ctx.toAED(c.amount, c.currency, c.startDate), 0))}`, `${newToday.length} contracts`],
                    ['Payouts made today', `AED ${full(paidToday.reduce((s, p) => s + ctx.toAED(p.amount, p.currency, p.paidDate), 0))}`, `${paidToday.length} payments`],
                    ['Pending this month', `AED ${full(k.dueMonthPending.aed)}`, `incl. AED ${full(k.overdue.aed)} overdue`],
                    ['Cash due tomorrow', `AED ${full(dueTomorrow)}`, fmtDate(tomorrow)],
                    ['Expenses this month', `AED ${full(k.exp.total)}`, `Surplus AED ${compact(k.surplus, 1)}`],
                    ['CRM commission payable', `AED ${full(crm.payable)}`, ''],
                  ]} />
                  <MiniBars />
                </>
              ) : (
                <Grid items={[
                  ['Open pipeline', `AED ${compact(open.reduce((s, l) => s + (l.expectedAmount ? ctx.toAED(l.expectedAmount, l.currency, ctx.ref) : 0), 0), 2)}`, `${open.length} deals`],
                  ['Yesterday’s new leads', String(leads.filter((l) => l.createdDate === addDays(ctx.ref, -1)).length), ''],
                  ['In KYC stage', String(leads.filter((l) => l.stage === 'KYC').length), 'closing soon'],
                  ['Stuck deals (7+ days)', String(stuckLeads(ctx).length), ''],
                  ['Payouts due this week', `AED ${full(week)}`, ''],
                  ['Birthdays in 2 days', String(upcomingBirthdays(ctx, 2).length), upcomingBirthdays(ctx, 2).map((b) => b.inv.fullName).join(', ')],
                ]} />
              )}
              <div className="mt-6 text-center">
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-gold-500 px-5 py-2.5 text-sm font-semibold text-navy-950"><Send size={14} /> Open secure dashboard</span>
              </div>
              <p className="mt-5 text-center text-[0.6875rem] text-muted">Sample figures. Sign-in is required to see investor details. Do not forward.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  function MiniBars() {
    const days = Array.from({ length: 7 }, (_, i) => addDays(ctx.ref, i - 6))
    const v = days.map((d) => ({ d, in: ctx.contracts.filter((c) => c.startDate === d).reduce((s, c) => s + ctx.toAED(c.amount, c.currency, d), 0), out: ctx.ds.payoutsPaid.filter((p) => ctx.contractIds.has(p.contractId) && p.paidDate === d).reduce((s, p) => s + ctx.toAED(p.amount, p.currency, d), 0) }))
    const max = Math.max(1, ...v.flatMap((x) => [x.in, x.out]))
    return (
      <div className="mt-5 rounded-xl border border-line p-4">
        <div className="mb-3 text-xs font-semibold text-muted">LAST 7 DAYS · <span style={{ color: '#14998a' }}>■ in</span> <span style={{ color: '#c4553d' }}>■ out</span></div>
        <div className="flex h-24 items-end justify-between gap-2">
          {v.map((x) => (
            <div key={x.d} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-20 w-full items-end justify-center gap-0.5">
                <div className="w-2.5 rounded-t" style={{ height: `${(x.in / max) * 100}%`, background: '#14998a' }} />
                <div className="w-2.5 rounded-t" style={{ height: `${(x.out / max) * 100}%`, background: '#c4553d' }} />
              </div>
              <div className="text-[0.625rem] text-muted">{fmtDate(x.d, false).slice(0, 2)}</div>
            </div>
          ))}
        </div>
      </div>
    )
  }
}

function Grid({ items }: { items: [string, string, string][] }) {
  return (
    <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map(([l, v, s]) => (
        <div key={l} className="rounded-xl border border-line px-4 py-3">
          <div className="text-xs text-muted">{l}</div>
          <div className="num mt-0.5 text-lg font-semibold">{v}</div>
          {s && <div className="text-[0.6875rem] text-muted">{s}</div>}
        </div>
      ))}
    </div>
  )
}
