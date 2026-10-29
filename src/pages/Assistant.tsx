import { Bot, Send, ShieldCheck, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import VizChart from '../components/VizChart'
import { Badge, Card, PageHeader } from '../components/ui'
import { DEFAULT_SPEC, MEASURES, pivot, specTitle, type ChartKind, type DimId, type Grain, type MeasureId, type RangeId, type VizSpec } from '../data/explore'
import { buildCtx, homeKpis, upcomingBirthdays, type Ctx } from '../data/engine'
import { useStore, type User } from '../data/store'
import { fmtDate, monthLabel } from '../lib/dates'
import { compact, full } from '../lib/format'

/** Production: Gemini 2.5 Flash on Vertex AI, called from a server function with read-only tools. */
export const AI_MODEL = { provider: 'Google Vertex AI', model: 'gemini-2.5-flash' }

interface Answer {
  role: 'ai'
  headline?: string
  text?: ReactNode
  kpis?: { label: string; value: string; tone?: 'good' | 'bad' | 'warn' }[]
  viz?: VizSpec
  list?: ReactNode
  tool: string
  followUps: string[]
}
type Msg = { role: 'user'; text: string } | Answer

const STARTERS = [
  'How much did we pay today?',
  'Which investors are pending?',
  'Total payout commitment this month',
  'Show money raised by country, last 12 months',
  'Expense mix this year as a pie',
  'Capital to return next 12 months by quarter',
  'Top salespeople by money raised',
  'How much did India raise this month?',
  'Overdue payouts by country',
  'Active capital growth by product',
]

// ---------------------------------------------------------------- intent → VizSpec (what Gemini returns via function calling)

const MEASURE_WORDS: [RegExp, MeasureId][] = [
  [/overdue|late|unpaid/, 'overdue'],
  [/capital (to )?return|maturit|matur|capital due/, 'capitalDue'],
  [/profit due|commitment|obligation|due payout|payouts? due/, 'profitDue'],
  [/paid out|payouts?( made)?|payments? made|we pay/, 'payouts'],
  [/active capital|aum|portfolio size|capital growth|book/, 'activeCapital'],
  [/company commission|management fee/, 'companyComm'],
  [/(crm|sales|freelancer|staff) commission|commission/, 'crmComm'],
  [/expense|cost|salar|rent|marketing/, 'expenses'],
  [/internal|sub.?compan/, 'internal'],
  [/pipeline|leads?|deals?/, 'pipeline'],
  [/how many contracts|contract count|number of contracts|new contracts/, 'contracts'],
  [/raise|raised|invest|new money|received|inflow|salespeople|sales team/, 'investment'],
]
const DIM_WORDS: [RegExp, DimId][] = [
  [/by country|per country|each country|countries/, 'country'],
  [/by company|per company|each company/, 'company'],
  [/by product|per product|each product|plans?/, 'product'],
  [/by currency|per currency|currencies/, 'currency'],
  [/salespe|sales ?person|agent|freelancer|staff|sales team|top sales/, 'sales'],
  [/segment|platinum|gold|silver/, 'segment'],
  [/stage|category|type|mix|breakdown|sub.?compan/, 'category'],
]
const CHART_WORDS: [RegExp, ChartKind][] = [
  [/pie|donut|share|mix/, 'donut'],
  [/treemap|tree map/, 'treemap'],
  [/table|list all|rows/, 'table'],
  [/top|rank|best|largest|biggest|leader/, 'bar'],
  [/growth|cumulative|area/, 'area'],
  [/trend|over time|line/, 'line'],
  [/stack/, 'stacked'],
]
const RANGE_WORDS: [RegExp, RangeId][] = [
  [/next 12|next year|upcoming year|12 months ahead|forecast/, 'N12M'],
  [/next 6|next six|coming months|upcoming/, 'N6M'],
  [/24 months|2 years|two years/, 'L24M'],
  [/last 6|six months|6 months/, 'L6M'],
  [/this year|ytd|year to date/, 'YTD'],
  [/all time|ever|since start/, 'ALL'],
  [/12 months|last year|past year/, 'L12M'],
]
const COUNTRY_WORDS: [RegExp, string][] = [[/india|indian/, 'IN'], [/malaysia|malaysian/, 'MY'], [/\buae\b|emirates|dubai/, 'AE']]

function parse(q: string): VizSpec | null {
  const s = q.toLowerCase()
  const measure = MEASURE_WORDS.find(([r]) => r.test(s))?.[1]
  if (!measure) return null
  const meta = MEASURES.find((m) => m.id === measure)!
  let dim = DIM_WORDS.find(([r]) => r.test(s))?.[1] ?? 'none'
  if (dim !== 'none' && !meta.dims.includes(dim)) dim = 'none'
  const future = measure === 'profitDue' || measure === 'capitalDue'
  let range = RANGE_WORDS.find(([r]) => r.test(s))?.[1] ?? (future ? 'N6M' : 'L12M')
  const thisMonth = /this month|today|so far/.test(s)
  const grain: Grain = /quarter/.test(s) ? 'quarter' : /year(ly)?\b|annual/.test(s) && !/this year/.test(s) ? 'year' : 'month'
  let chart = CHART_WORDS.find(([r]) => r.test(s))?.[1] ?? (dim === 'none' ? (thisMonth ? 'kpi' : 'column') : 'stacked')
  if (thisMonth && chart === 'stacked') chart = 'donut'
  if (thisMonth) range = future ? 'N6M' : 'L6M'
  const countries = COUNTRY_WORDS.filter(([r]) => r.test(s)).map(([, c]) => c)
  return { ...DEFAULT_SPEC, measure, dim, chart, range, grain, topN: chart === 'bar' ? 8 : 5, cumulative: /cumulative|running/.test(s), pctOfTotal: /percent|%|share of/.test(s) && chart !== 'donut', countries: countries.length ? countries : undefined }
}

function restricted(user: User | null, countries?: string[]) {
  return !!(user?.countries.length && countries?.length && !countries.some((c) => user.countries.includes(c as never)))
}

function answer(q: string, ctx: Ctx, user: User | null): Answer {
  const s = q.toLowerCase()
  const k = homeKpis(ctx)

  if (/pay.*today|paid today/.test(s)) {
    const rows = ctx.ds.payoutsPaid.filter((p) => ctx.contractIds.has(p.contractId) && p.paidDate === ctx.ref)
    const aed = rows.reduce((a, p) => a + ctx.toAED(p.amount, p.currency, p.paidDate), 0)
    return {
      role: 'ai', headline: `AED ${full(aed)} paid today`, text: <>Across <b>{rows.length}</b> settled payments on {fmtDate(ctx.ref)}. Here is the last 6 months for context.</>,
      kpis: [{ label: 'Paid today', value: `AED ${compact(aed, 2)}` }, { label: 'Paid this month', value: `AED ${compact(k.dueMonthPaid.aed, 2)}`, tone: 'good' }, { label: 'Still pending', value: `AED ${compact(k.dueMonthPending.aed, 2)}`, tone: 'warn' }],
      viz: { ...DEFAULT_SPEC, measure: 'payouts', dim: 'currency', chart: 'stacked', range: 'L6M' },
      tool: `get_daily_payments(date="${ctx.ref}")`, followUps: ['Which investors are pending?', 'Overdue payouts by country', 'Payout commitments next 6 months'],
    }
  }
  if (/pending|who.*not.*paid|which investors/.test(s)) {
    const rows = ctx.schedule.filter((r) => r.dueDate <= ctx.monthEnd && r.status !== 'Paid' && r.status !== 'Upcoming')
    const byInv = new Map<string, number>()
    for (const r of rows) {
      const id = ctx.contractById.get(r.contractId)!.investorId
      byInv.set(id, (byInv.get(id) ?? 0) + ctx.toAED(r.remaining, r.currency, r.dueDate))
    }
    const top = [...byInv.entries()].sort((a, b) => b[1] - a[1])
    return {
      role: 'ai', headline: `${top.length} investors pending · AED ${full(k.dueMonthPending.aed)}`,
      text: <>Includes <b className="text-bad">AED {full(k.overdue.aed)} overdue</b>. Largest amounts:</>,
      list: <ol className="mt-1 space-y-1">{top.slice(0, 8).map(([id, v], i) => <li key={id} className="flex justify-between gap-3 text-xs"><Link className="hover:underline" to={`/investors/${id}`}>{i + 1}. {ctx.investorById.get(id)?.fullName}</Link><span className="num font-semibold">AED {full(v)}</span></li>)}</ol>,
      viz: { ...DEFAULT_SPEC, measure: 'overdue', dim: 'country', chart: 'donut', range: 'ALL' },
      tool: `get_pending_payouts(period="${ctx.filters.month}")`, followUps: ['Overdue payouts by country', 'How much did we pay today?', 'Total payout commitment this month'],
    }
  }
  if (/commitment|due this month|payout.*this month|this month.*payout/.test(s)) {
    return {
      role: 'ai', headline: `AED ${full(k.dueMonth.aed)} due this month`,
      kpis: [{ label: 'Paid', value: `AED ${compact(k.dueMonthPaid.aed, 2)}`, tone: 'good' }, { label: 'Pending', value: `AED ${compact(k.dueMonthPending.aed, 2)}`, tone: 'warn' }, { label: 'Capital returns', value: `AED ${compact(k.expiringCapital.aed, 2)}` }],
      text: <>The next 6 months of commitments by product:</>,
      viz: { ...DEFAULT_SPEC, measure: 'profitDue', dim: 'product', chart: 'stacked', range: 'N6M' },
      tool: `get_month_obligations(month="${ctx.filters.month}")`, followUps: ['Capital to return next 12 months by quarter', 'Which investors are pending?', 'Cash forecast'],
    }
  }
  if (/birthday/.test(s)) {
    const b = upcomingBirthdays(ctx, 7)
    return { role: 'ai', headline: `${b.length} birthdays in the next 7 days`, list: <ul className="space-y-1 text-xs">{b.map((x) => <li key={x.inv.id}>🎂 {x.inv.fullName}, in {x.days} days ({fmtDate(x.inv.dateOfBirth, false)})</li>)}</ul>, tool: 'get_birthdays(days=7)', followUps: ['Which investors are pending?', 'Contracts expiring this month'] }
  }
  if (/expir|matur/.test(s) && /this month|which contracts/.test(s)) {
    return {
      role: 'ai', headline: `${k.expiring.length} contracts mature · AED ${full(k.expiringCapital.aed)}`,
      list: <ul className="space-y-1 text-xs">{k.expiring.slice(0, 8).map((c) => <li key={c.id} className="flex justify-between gap-3"><span>{ctx.investorById.get(c.investorId)?.fullName} · {fmtDate(c.endDate, false)} · {c.renewalStatus}</span><span className="num font-semibold">{c.currency} {full(c.amount)}</span></li>)}</ul>,
      viz: { ...DEFAULT_SPEC, measure: 'capitalDue', dim: 'company', chart: 'column', range: 'N12M', grain: 'quarter' },
      tool: `get_expiring_contracts(month="${ctx.filters.month}")`, followUps: ['Capital to return next 12 months by quarter', 'Total payout commitment this month'],
    }
  }

  const spec = parse(q)
  if (spec) {
    if (restricted(user, spec.countries)) {
      return { role: 'ai', headline: 'You don’t have access to that country', text: <>Your account is limited to {user!.countries.join(', ')}. Ask the Chairman if you need wider access.</>, tool: 'access_check() → denied', followUps: STARTERS.slice(0, 3) }
    }
    const scoped = spec.countries?.length ? buildCtx(ctx.ds, { ...ctx.filters, countries: spec.countries }, ctx.today) : ctx
    const p = pivot(scoped, spec)
    const last = p.rows[p.rows.length - 1]
    const lastV = last ? p.series.reduce((a, x) => a + (last[x.key] as number), 0) : 0
    const top = [...p.totals].sort((a, b) => b.value - a.value)[0]
    const where = spec.countries?.length ? ` · ${spec.countries.map((c) => ctx.ds.countries.find((x) => x.code === c)?.name).join(', ')}` : ''
    const unit = (v: number) => (p.unit === 'count' ? full(v) : `AED ${compact(v, 2)}`)
    return {
      role: 'ai',
      headline: `${p.measureLabel}${where}: ${unit(p.grand)}`,
      kpis: [
        { label: 'Total in period', value: unit(p.grand) },
        ...(last ? [{ label: `Latest (${last.label})`, value: unit(lastV) }] : []),
        ...(top && spec.dim !== 'none' ? [{ label: `Largest ${p.dimLabel.toLowerCase()}`, value: top.label }] : []),
      ],
      viz: spec,
      tool: `query_metric(measure="${spec.measure}", split="${spec.dim}", range="${spec.range}"${spec.countries ? `, countries=${JSON.stringify(spec.countries)}` : ''})`,
      followUps: [
        spec.dim !== 'country' && MEASURES.find((m) => m.id === spec.measure)!.dims.includes('country') ? `${p.measureLabel} by country` : `${p.measureLabel} by product`,
        `${p.measureLabel} as a trend line`,
        `${p.measureLabel} all time as a table`,
      ],
    }
  }
  return {
    role: 'ai', headline: 'I can answer that with your data. Try asking it like this:',
    text: <>Name <b>what</b> (payouts, money raised, expenses, commission, overdue, pipeline…), optionally <b>how to split</b> (by country, product, salesperson…), <b>when</b> (this month, last 6 months, next 12 months) and <b>a chart</b> (pie, trend, table, top).</>,
    tool: 'no_matching_tool', followUps: STARTERS.slice(3, 7),
  }
}

// ---------------------------------------------------------------- UI

export default function Assistant() {
  const { ctx, user } = useStore()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [q, setQ] = useState('')
  const [thinking, setThinking] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [msgs, thinking])

  const ask = (text: string) => {
    if (!text.trim() || thinking) return
    setMsgs((m) => [...m, { role: 'user', text }])
    setQ('')
    setThinking(true)
    setTimeout(() => {
      setMsgs((m) => [...m, answer(text, ctx, user)])
      setThinking(false)
    }, 650)
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="AI Assistant"
        subtitle="Ask in plain English. Every answer comes with the numbers and a chart, built from the same records as the dashboard."
        actions={<Badge tone="gold" icon={<Sparkles size={12} />}>{AI_MODEL.model} · {AI_MODEL.provider} (preview)</Badge>}
      />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_300px]">
        <Card pad={false} className="overflow-hidden">
          <div className="flex h-[calc(100dvh-260px)] min-h-[480px] flex-col lg:h-[calc(100dvh-230px)]">
            <div className="scroll-thin flex-1 space-y-5 overflow-y-auto p-3 sm:p-5">
              {!msgs.length && (
                <div className="flex flex-col items-center px-2 pt-6 text-center">
                  <div className="grid h-16 w-16 place-items-center rounded-2xl bg-navy-900 shadow-lg"><img src="/gsy-logo.webp" alt="" className="h-14 w-14" /></div>
                  <h2 className="mt-4 text-lg font-semibold">Hello {user?.name}, what would you like to know?</h2>
                  <p className="mt-1 max-w-md text-sm text-muted">I answer only from approved, reconciled records and always show the period and data time. I can’t approve or send payments.</p>
                  <div className="mt-5 grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
                    {STARTERS.slice(0, 8).map((s) => (
                      <button key={s} onClick={() => ask(s)} className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-left text-sm text-ink-2 transition hover:border-gold-500 hover:bg-gold-50">{s}</button>
                    ))}
                  </div>
                </div>
              )}
              {msgs.map((m, i) =>
                m.role === 'user' ? (
                  <div key={i} className="flex justify-end"><div className="max-w-[85%] rounded-2xl rounded-br-md bg-navy-900 px-4 py-2.5 text-sm text-white">{m.text}</div></div>
                ) : (
                  <AnswerCard key={i} a={m} onAsk={ask} asOf={`${monthLabel(ctx.filters.month, 'long')} · data as of 09:00`} />
                ),
              )}
              {thinking && (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-navy-900"><Bot size={16} className="text-gold-400" /></span>
                  <span className="flex gap-1"><Dot d={0} /><Dot d={150} /><Dot d={300} /></span>
                  <span className="text-xs">Checking approved records…</span>
                </div>
              )}
              <div ref={end} />
            </div>
            <div className="border-t border-line bg-white p-2.5 sm:p-3">
              {msgs.length > 0 && (
                <div className="scroll-thin mb-2 flex gap-1.5 overflow-x-auto pb-1">
                  {STARTERS.map((s) => <button key={s} onClick={() => ask(s)} className="shrink-0 rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-2 hover:border-gold-500">{s}</button>)}
                </div>
              )}
              <form onSubmit={(e) => { e.preventDefault(); ask(q) }} className="flex gap-2">
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. payouts by country last 6 months as a pie" className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 text-sm outline-none focus:border-gold-500" />
                <button type="submit" disabled={thinking} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gold-500 text-navy-950 hover:bg-gold-400 disabled:opacity-50" aria-label="Send"><Send size={17} /></button>
              </form>
            </div>
          </div>
        </Card>

        <Card title={<span className="flex items-center gap-2"><ShieldCheck size={16} className="text-good" /> How answers stay safe</span>} className="hidden xl:block">
          <ol className="flex flex-col gap-3 text-sm text-ink-2">
            <li><b className="text-ink">1. Understand.</b> Gemini 2.5 Flash reads the question and picks one approved tool, e.g. <code className="text-xs">query_metric</code>.</li>
            <li><b className="text-ink">2. Check access.</b> The server checks who is asking (country limits apply) and runs a read-only query. No free SQL.</li>
            <li><b className="text-ink">3. Answer with evidence.</b> Totals, chart, period and data time. Numbers come from the tool, never invented.</li>
            <li><b className="text-ink">4. Never act.</b> It cannot approve, edit or send payments.</li>
          </ol>
          <div className="mt-4 rounded-xl bg-page p-3 text-xs text-muted">Model: <b className="text-ink">{AI_MODEL.model}</b> on {AI_MODEL.provider}. API keys stay on the server.</div>
        </Card>
      </div>
    </div>
  )
}

function AnswerCard({ a, onAsk, asOf }: { a: Answer; onAsk: (q: string) => void; asOf: string }) {
  return (
    <div className="flex gap-2.5">
      <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-navy-900"><Bot size={16} className="text-gold-400" /></span>
      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-line bg-white p-3.5 shadow-sm sm:p-4">
        {a.headline && <div className="num text-base font-semibold sm:text-lg">{a.headline}</div>}
        {a.text && <p className="mt-1 text-sm text-ink-2">{a.text}</p>}
        {a.kpis && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {a.kpis.map((k) => (
              <div key={k.label} className="rounded-xl bg-page px-3 py-2">
                <div className="text-[0.6875rem] text-muted">{k.label}</div>
                <div className={`num truncate text-sm font-semibold ${k.tone === 'good' ? 'text-good' : k.tone === 'bad' ? 'text-bad' : k.tone === 'warn' ? 'text-warn' : ''}`}>{k.value}</div>
              </div>
            ))}
          </div>
        )}
        {a.list && <div className="mt-3">{a.list}</div>}
        {a.viz && (
          <div className="mt-4 rounded-xl border border-line-2 p-2.5 sm:p-3">
            <div className="mb-2 text-xs font-semibold text-ink-2">{specTitle(a.viz)}</div>
            <VizChart spec={a.viz} height={230} />
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-2 pt-2 text-[0.6875rem] text-muted">
          <span>Tool: <code>{a.tool}</code></span><span>{asOf}</span>
        </div>
        {a.followUps.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {a.followUps.map((f) => <button key={f} onClick={() => onAsk(f)} className="rounded-full bg-gold-50 px-2.5 py-1 text-[0.6875rem] font-medium text-gold-600 hover:bg-gold-100">{f} →</button>)}
          </div>
        )}
      </div>
    </div>
  )
}

function Dot({ d }: { d: number }) {
  return <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gold-500" style={{ animationDelay: `${d}ms` }} />
}
