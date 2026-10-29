import { ArrowLeft, Printer } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { investorSummary } from '../data/engine'
import { useStore } from '../data/store'
import { fmtDate } from '../lib/dates'
import { full, pct } from '../lib/format'

/** Printable investor statement (brief §10). "Save as PDF" from the print dialog produces the PDF. */
export default function Statement() {
  const { id = '' } = useParams()
  const { ctx } = useStore()
  const inv = ctx.investorById.get(id)
  if (!inv) return <div className="p-10">Investor not found.</div>
  const s = investorSummary(ctx, id)
  const rows = [...s.rows].sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const curs = [...new Set(s.contracts.map((c) => c.currency))]

  return (
    <div className="min-h-screen bg-page py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[820px] items-center justify-between px-4">
        <Link to={`/investors/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={15} /> Back to portfolio</Link>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-xl bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800"><Printer size={15} /> Print / Save as PDF</button>
      </div>

      <article className="mx-auto max-w-[820px] bg-white px-10 py-10 text-[13px] text-ink shadow-sm print:max-w-none print:px-0 print:py-0 print:shadow-none">
        <header className="flex items-start justify-between border-b-2 border-gold-500 pb-5">
          <div className="flex items-center gap-3">
            <img src="/gsy-logo.webp" alt="GSY" className="h-14 w-14" />
            <div>
              <div className="text-lg font-bold tracking-wide text-navy-900">GSY INVESTMENT GROUP</div>
              <div className="text-xs text-muted">Investor Account Statement</div>
            </div>
          </div>
          <div className="text-right text-xs text-muted">
            <div>Statement date: <b className="text-ink">{fmtDate(ctx.ref)}</b></div>
            <div>Reference: ST-{inv.id}-{ctx.ref.replace(/-/g, '')}</div>
          </div>
        </header>

        <section className="mt-6 grid grid-cols-2 gap-6">
          <div>
            <div className="mb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">Investor</div>
            <div className="text-base font-semibold">{inv.fullName}</div>
            <div>{inv.id}</div>
            <div>{inv.city}, {ctx.ds.countries.find((c) => c.code === inv.country)?.name}</div>
            <div>{inv.email}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {curs.map((cur) => {
              const cs = s.contracts.filter((c) => c.currency === cur && c.startDate <= ctx.ref)
              const rs = rows.filter((r) => r.currency === cur)
              return (
                <div key={cur} className="col-span-2 grid grid-cols-2 gap-2 rounded-lg border border-line p-3">
                  <Mini k={`Invested (${cur})`} v={full(cs.reduce((a, c) => a + c.amount, 0))} />
                  <Mini k="Profit paid" v={full(rs.reduce((a, r) => a + Math.min(r.paid, r.profitDue), 0))} />
                  <Mini k="Profit remaining" v={full(rs.filter((r) => r.dueDate > ctx.ref).reduce((a, r) => a + r.profitDue, 0))} />
                  <Mini k="Unpaid to date" v={full(rs.filter((r) => r.dueDate <= ctx.ref).reduce((a, r) => a + r.remaining, 0))} />
                </div>
              )
            })}
          </div>
        </section>

        <h3 className="mt-7 mb-2 text-sm font-semibold text-navy-900">Contracts</h3>
        <table className="w-full border-collapse text-[12px]">
          <thead><tr className="bg-gold-50 text-left text-[11px] text-muted uppercase"><th className="p-2">Contract</th><th className="p-2">Product</th><th className="p-2">Start</th><th className="p-2">Maturity</th><th className="p-2 text-right">Amount</th><th className="p-2 text-right">Profit / month</th><th className="p-2 text-right">Months done / pending</th></tr></thead>
          <tbody>
            {s.perContract.map(({ c, monthsCompleted, monthsPending }) => (
              <tr key={c.id} className="border-b border-line-2">
                <td className="p-2 font-medium">{c.id}</td>
                <td className="p-2">{ctx.productById.get(c.productId)?.name}</td>
                <td className="p-2">{fmtDate(c.startDate)}</td>
                <td className="p-2">{fmtDate(c.endDate)}</td>
                <td className="num p-2 text-right">{c.currency} {full(c.amount)}</td>
                <td className="num p-2 text-right">{pct(c.monthlyProfitPct, 2)}</td>
                <td className="num p-2 text-right">{monthsCompleted} / {monthsPending}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="mt-7 mb-2 text-sm font-semibold text-navy-900">Payment schedule</h3>
        <table className="w-full border-collapse text-[12px]">
          <thead><tr className="bg-gold-50 text-left text-[11px] text-muted uppercase"><th className="p-2">Due date</th><th className="p-2">Contract</th><th className="p-2 text-right">Profit</th><th className="p-2 text-right">Capital</th><th className="p-2">Paid date</th><th className="p-2 text-right">Paid</th><th className="p-2">Status</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-line-2 break-inside-avoid">
                <td className="p-2">{fmtDate(r.dueDate)}</td>
                <td className="p-2">{r.contractId}</td>
                <td className="num p-2 text-right">{r.currency} {full(r.profitDue)}</td>
                <td className="num p-2 text-right">{r.capitalDue ? full(r.capitalDue) : '—'}</td>
                <td className="p-2">{fmtDate(r.lastPaidDate)}</td>
                <td className="num p-2 text-right">{r.paid ? full(r.paid) : '—'}</td>
                <td className={`p-2 ${r.status === 'Overdue' ? 'font-semibold text-bad' : ''}`}>{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <footer className="mt-12 grid grid-cols-2 gap-10 text-xs text-muted">
          <div><div className="h-16 border-b border-line" /><div className="mt-1">Authorised signatory</div></div>
          <div><div className="h-16 border-b border-line" /><div className="mt-1">Company stamp</div></div>
        </footer>
        <p className="mt-8 text-[10px] text-muted">This statement is generated from GSY’s reconciled records as of {fmtDate(ctx.ref)}. Please report any discrepancy to Accounts within 14 days.</p>
      </article>
    </div>
  )
}

function Mini({ k, v }: { k: string; v: string }) {
  return <div><div className="text-[10px] text-muted uppercase">{k}</div><div className="num font-semibold">{v}</div></div>
}
