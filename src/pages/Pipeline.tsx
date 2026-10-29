import { BarList, C, ENTITY_COLOR } from '../components/charts'
import { Badge, Card, Kpi, PageHeader, StatusBadge, TableWrap } from '../components/ui'
import { filteredLeads, stuckLeads } from '../data/engine'
import { useStore } from '../data/store'
import { FUNNEL_STAGES, OPEN_STAGES } from '../data/types'
import { addDays, daysBetween, fmtDate } from '../lib/dates'
import { compact, full, pct } from '../lib/format'

export default function Pipeline() {
  const { ctx, ds } = useStore()
  const leads = filteredLeads(ctx)
  const open = leads.filter((l) => OPEN_STAGES.includes(l.stage))
  const aed = (l: (typeof leads)[number]) => (l.expectedAmount ? ctx.toAED(l.expectedAmount, l.currency, ctx.ref) : 0)
  const stuck = stuckLeads(ctx)
  const yesterday = addDays(ctx.ref, -1)
  const yActivity = leads.filter((l) => l.lastActivityDate === yesterday || l.createdDate === yesterday)
  const funded = leads.filter((l) => l.stage === 'Funded')
  const lost = leads.filter((l) => l.stage === 'Lost')
  const conv = funded.length / Math.max(1, funded.length + lost.length)

  // Funnel: a lead counts at every stage it has reached.
  const order = (s: string) => FUNNEL_STAGES.indexOf(s as never)
  const reached = FUNNEL_STAGES.map((s) => {
    const rows = leads.filter((l) => l.stage !== 'Lost' && order(l.stage) >= order(s))
    return { stage: s, n: rows.length, v: rows.reduce((a, l) => a + aed(l), 0) }
  })
  const max = reached[0]?.n || 1

  const bySales = ds.salesPeople.map((sp) => ({ key: sp.id, label: sp.name, sub: `${sp.type} · ${open.filter((l) => l.salesId === sp.id).length} open deals`, value: open.filter((l) => l.salesId === sp.id).reduce((a, l) => a + aed(l), 0), color: ENTITY_COLOR[sp.country] })).filter((r) => r.value > 0).sort((a, b) => b.value - a.value)
  const byCountry = ds.countries.map((c) => ({ key: c.code, label: c.name, color: ENTITY_COLOR[c.code], value: open.filter((l) => ctx.salesById.get(l.salesId)?.country === c.code).reduce((a, l) => a + aed(l), 0) }))
  const bySource = ['Referral', 'Social media', 'Events', 'Freelancer', 'Website'].map((s, i) => ({ key: s, label: s, color: [C.c1, C.c2, C.c3, C.c4, C.c5][i], value: funded.filter((l) => l.source === s).reduce((a, l) => a + aed(l), 0), sub: `${leads.filter((l) => l.source === s).length} leads · ${funded.filter((l) => l.source === s).length} funded` }))

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="CRM Pipeline" subtitle="From first contact to funded: where every deal stands, who owns it and which deals are stuck" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <Kpi label="Open pipeline value" accent="gold"><span className="num text-2xl font-semibold"><span className="mr-1 text-xs text-muted">AED</span>{compact(open.reduce((a, l) => a + aed(l), 0), 2)}</span></Kpi>
        <Kpi label="Open deals"><span className="num text-2xl font-semibold sm:text-3xl">{open.length}</span></Kpi>
        <Kpi label="Win rate" sub={`${funded.length} funded · ${lost.length} lost`}><span className="num text-2xl font-semibold sm:text-3xl">{pct(conv, 0)}</span></Kpi>
        <Kpi label="Yesterday’s activity" sub={fmtDate(yesterday)}><span className="num text-2xl font-semibold sm:text-3xl">{yActivity.length}</span></Kpi>
        <Kpi label="Stuck over 7 days" accent="bad"><span className="num text-2xl font-semibold sm:text-3xl text-bad">{stuck.length}</span></Kpi>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
        <Card className="xl:col-span-3" title="Funnel" subtitle="Deals that reached each stage · conversion from the previous stage">
          <div className="flex flex-col gap-2.5">
            {reached.map((r, i) => (
              <div key={r.stage} className="flex items-center gap-3">
                <div className="w-20 shrink-0 text-xs font-medium text-ink-2">{r.stage}</div>
                <div className="relative h-9 flex-1">
                  <div className="absolute inset-y-0 left-1/2 flex -translate-x-1/2 items-center justify-center rounded-lg text-xs font-semibold text-white" style={{ width: `${Math.max(14, (r.n / max) * 100)}%`, background: i === FUNNEL_STAGES.length - 1 ? C.c3 : C.c1, opacity: 1 - i * 0.1 }}>
                    <span className="num">{r.n}</span>
                  </div>
                </div>
                <div className="w-24 shrink-0 text-right">
                  <div className="num text-xs font-semibold">AED {compact(r.v, 1)}</div>
                  <div className="text-[0.6875rem] text-muted">{i ? pct(r.n / Math.max(1, reached[i - 1].n), 0) : '100%'}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="xl:col-span-2" title="Open value by country" subtitle="AED">
          <BarList rows={byCountry} />
          <div className="mt-5 border-t border-line-2 pt-4">
            <div className="mb-2 text-xs font-semibold text-muted">Funded value by lead source</div>
            <BarList rows={bySource} />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Card title="Open value by salesperson" subtitle="AED · colour = country team"><BarList rows={bySales} /></Card>
        <Card title="Stuck deals" subtitle="Open deals with no activity for more than 7 days">
          <TableWrap max="max-h-[380px]">
            <table className="tbl">
              <thead><tr><th>Lead</th><th>Stage</th><th>Owner</th><th className="r">Idle days</th><th className="r">Value</th><th>Next action</th></tr></thead>
              <tbody>
                {stuck.map((l) => (
                  <tr key={l.id}>
                    <td className="font-medium">{l.name}<div className="text-[0.6875rem] text-muted">{l.id}</div></td>
                    <td><Badge tone="info">{l.stage}</Badge></td>
                    <td>{ctx.salesById.get(l.salesId)?.name}</td>
                    <td className="r font-semibold text-bad">{daysBetween(l.lastActivityDate, ctx.ref)}</td>
                    <td className="r">{l.expectedAmount ? `${l.currency} ${full(l.expectedAmount)}` : <Badge tone="warn">No amount</Badge>}</td>
                    <td>{l.nextAction}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      </div>

      <Card title="All deals" subtitle={`${leads.length} leads`}>
        <TableWrap max="max-h-[480px]">
          <table className="tbl">
            <thead><tr><th>Created</th><th>Lead</th><th>Stage</th><th>Owner</th><th>Source</th><th>Product</th><th className="r">Expected</th><th>Last activity</th><th>Next action</th></tr></thead>
            <tbody>
              {[...leads].sort((a, b) => b.lastActivityDate.localeCompare(a.lastActivityDate)).map((l) => (
                <tr key={l.id}>
                  <td>{fmtDate(l.createdDate)}</td>
                  <td className="font-medium">{l.name}</td>
                  <td>{OPEN_STAGES.includes(l.stage) ? <Badge tone="info">{l.stage}</Badge> : <StatusBadge s={l.stage} />}</td>
                  <td>{ctx.salesById.get(l.salesId)?.name}</td>
                  <td>{l.source}</td>
                  <td>{ctx.productById.get(l.productId)?.name}</td>
                  <td className="r">{l.expectedAmount ? `${l.currency} ${full(l.expectedAmount)}` : '—'}</td>
                  <td>{fmtDate(l.lastActivityDate)}</td>
                  <td>{l.nextAction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </div>
  )
}
