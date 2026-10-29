import { AlertTriangle, CheckCircle2, Clock, Info, Maximize2, X, XCircle } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useStore } from '../data/store'
import type { Currency, Money } from '../data/types'
import { compact, curLabel, full, moneyEntries } from '../lib/format'

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ title, subtitle, action, children, className = '', pad = true }: { title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  const [focus, setFocus] = useState(false)
  useEffect(() => {
    if (!focus) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && setFocus(false)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [focus])
  const header = (inFocus: boolean) => (title || action) && (
    <header className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5">
      <div className="min-w-0">
        {title && <h2 className={`${inFocus ? 'text-lg' : 'text-[0.9375rem]'} font-semibold text-ink`}>{title}</h2>}
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-start gap-1.5">
        {action}
        {title && (
          <button onClick={() => setFocus(!inFocus)} title={inFocus ? 'Close (Esc)' : 'Focus mode'} aria-label={inFocus ? 'Close focus mode' : 'Open focus mode'} className="no-print rounded-lg p-1.5 text-muted transition hover:bg-gold-50 hover:text-ink">
            {inFocus ? <X size={18} /> : <Maximize2 size={14} />}
          </button>
        )}
      </div>
    </header>
  )
  return (
    <section className={`group/card min-w-0 rounded-2xl border border-line bg-surface shadow-[0_1px_2px_rgba(15,29,51,0.04)] ${className}`}>
      {header(false)}
      <div className={pad ? 'p-4 sm:p-5' : ''}>{children}</div>
      {focus && createPortal(
        <div className="fixed inset-0 z-[70] flex items-stretch justify-center bg-navy-950/60 p-2 backdrop-blur-sm sm:p-6" onClick={() => setFocus(false)}>
          <div className="focus-body scroll-thin flex w-full max-w-[1400px] flex-col overflow-auto rounded-2xl bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {header(true)}
            <div className="flex-1 p-4 sm:p-6">{children}</div>
          </div>
        </div>,
        document.body,
      )}
    </section>
  )
}

/** Shows a Money value: AED total, or the original-currency breakdown when the Original view is on. */
export function MoneyView({ m, size = 'lg', forceAED = false }: { m: Money; size?: 'xl' | 'lg' | 'md' | 'sm'; forceAED?: boolean }) {
  const { filters } = useStore()
  const cls = { xl: 'text-[1.4rem] sm:text-3xl', lg: 'text-xl sm:text-2xl', md: 'text-lg', sm: 'text-sm' }[size]
  if (filters.view === 'AED' || forceAED) {
    return (
      <span className={`num font-semibold tracking-tight ${cls}`} title={`AED ${full(m.aed)}`}>
        <span className="mr-1 text-[0.55em] font-medium text-muted">AED</span>
        {compact(m.aed, 2)}
      </span>
    )
  }
  const entries = moneyEntries(m)
  if (!entries.length) return <span className={`num font-semibold ${cls}`}>—</span>
  return (
    <span className="flex flex-col gap-0.5">
      {entries.map(([c, v]) => (
        <span key={c} className="num text-sm font-semibold" title={`${c} ${full(v)}`}>
          <span className="mr-1 inline-block w-8 text-[0.7rem] font-medium text-muted">{curLabel(c)}</span>
          {compact(v, 2)}
        </span>
      ))}
      <span className="num text-[0.7rem] text-muted">≈ AED {compact(m.aed, 2)}</span>
    </span>
  )
}

export function Amount({ v, cur = 'AED', compactMode = false, className = '' }: { v: number; cur?: Currency; compactMode?: boolean; className?: string }) {
  return (
    <span className={`num ${className}`}>
      <span className="mr-1 text-[0.8em] text-muted">{curLabel(cur)}</span>
      {compactMode ? compact(v, 2) : full(v)}
    </span>
  )
}

type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'gold' | 'navy' | 'info'

const TONES: Record<Tone, string> = {
  neutral: 'bg-line-2 text-ink-2',
  good: 'bg-good-bg text-good',
  warn: 'bg-warn-bg text-warn',
  bad: 'bg-bad-bg text-bad',
  gold: 'bg-gold-100 text-gold-600',
  navy: 'bg-navy-900 text-white',
  info: 'bg-[#e8eef8] text-c1',
}

export function Badge({ tone = 'neutral', children, icon }: { tone?: Tone; children: ReactNode; icon?: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold whitespace-nowrap ${TONES[tone]}`}>
      {icon}
      {children}
    </span>
  )
}

export function StatusBadge({ s }: { s: string }) {
  const map: Record<string, [Tone, ReactNode]> = {
    Paid: ['good', <CheckCircle2 size={12} />],
    Settled: ['good', <CheckCircle2 size={12} />],
    OK: ['good', <CheckCircle2 size={12} />],
    Verified: ['good', <CheckCircle2 size={12} />],
    Active: ['good', <CheckCircle2 size={12} />],
    Renewing: ['good', <CheckCircle2 size={12} />],
    Funded: ['good', <CheckCircle2 size={12} />],
    Due: ['info', <Clock size={12} />],
    Upcoming: ['neutral', <Clock size={12} />],
    Pending: ['warn', <Clock size={12} />],
    Undecided: ['warn', <Clock size={12} />],
    Warning: ['warn', <AlertTriangle size={12} />],
    'Partly paid': ['warn', <AlertTriangle size={12} />],
    'Returning capital': ['gold', <Info size={12} />],
    Matured: ['neutral', <Info size={12} />],
    Overdue: ['bad', <XCircle size={12} />],
    Expired: ['bad', <XCircle size={12} />],
    Failed: ['bad', <XCircle size={12} />],
    Lost: ['bad', <XCircle size={12} />],
  }
  const [tone, icon] = map[s] ?? ['neutral', null]
  return <Badge tone={tone} icon={icon}>{s}</Badge>
}

export function Kpi({ label, children, sub, to, accent, icon }: { label: string; children: ReactNode; sub?: ReactNode; to?: string; accent?: 'gold' | 'bad' | 'good'; icon?: ReactNode }) {
  const bar = accent === 'bad' ? 'bg-bad' : accent === 'good' ? 'bg-good' : accent === 'gold' ? 'bg-gold-500' : 'bg-transparent'
  const body = (
    <div className="relative flex h-full flex-col gap-2 overflow-hidden rounded-2xl border border-line bg-surface p-3 shadow-[0_1px_2px_rgba(15,29,51,0.04)] transition hover:border-gold-500/50 hover:shadow-md">
      <span className={`absolute inset-y-0 left-0 w-1 ${bar}`} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.6875rem] leading-tight font-medium text-muted sm:text-xs">{label}</span>
        {icon && <span className="text-gold-600">{icon}</span>}
      </div>
      <div className="text-ink">{children}</div>
      {sub && <div className="mt-auto text-xs text-muted">{sub}</div>}
    </div>
  )
  return to ? <Link to={to} className="block h-full">{body}</Link> : body
}

export function Progress({ value, tone = 'good' }: { value: number; tone?: 'good' | 'gold' | 'bad' }) {
  const c = tone === 'good' ? 'bg-good' : tone === 'bad' ? 'bg-bad' : 'bg-gold-500'
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line-2">
      <div className={`h-full rounded-full ${c}`} style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
    </div>
  )
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'bad' | 'good' | 'warn' }) {
  const c = tone === 'bad' ? 'text-bad' : tone === 'good' ? 'text-good' : tone === 'warn' ? 'text-warn' : 'text-ink'
  return (
    <div className="min-w-0">
      <div className="text-[0.6875rem] font-medium tracking-wide text-muted uppercase">{label}</div>
      <div className={`num mt-0.5 text-base font-semibold ${c}`}>{value}</div>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">{children}</div>
}

export function TableWrap({ children, max = 'max-h-[420px]' }: { children: ReactNode; max?: string }) {
  return <div className={`scroll-thin -mx-4 overflow-auto sm:-mx-5 ${max}`}>{children}</div>
}

export function SampleBanner() {
  return (
    <Badge tone="gold" icon={<Info size={12} />}>
      Sample data · for layout approval
    </Badge>
  )
}

export function Btn({ children, onClick, variant = 'primary', icon, type = 'button' }: { children: ReactNode; onClick?: () => void; variant?: 'primary' | 'ghost' | 'gold'; icon?: ReactNode; type?: 'button' | 'submit' }) {
  const v = {
    primary: 'bg-navy-900 text-white hover:bg-navy-800',
    gold: 'bg-gold-500 text-navy-950 hover:bg-gold-400',
    ghost: 'border border-line bg-surface text-ink hover:bg-gold-50',
  }[variant]
  return (
    <button type={type} onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition ${v}`}>
      {icon}
      {children}
    </button>
  )
}
