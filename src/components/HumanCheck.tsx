import { Fingerprint, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ThemeToggle } from './ui'

const KEY = 'gsy.portal.human'
const HOLD_MS = 2000
const VALID_MS = 8 * 60 * 60 * 1000 // ask again after 8 hours

export function isHumanVerified() {
  try {
    const t = Number(sessionStorage.getItem(KEY))
    return t > 0 && Date.now() - t < VALID_MS
  } catch {
    return false
  }
}
export function markHuman() {
  try { sessionStorage.setItem(KEY, String(Date.now())) } catch { /* private mode */ }
}

/**
 * Press-and-hold control: only a real, trusted press held for 2 seconds completes it.
 * Used to sign in on both sites and as the gate before a restored session opens.
 */
export function HoldButton({ label, holdingLabel = 'Keep holding…', doneLabel = 'Verified', onDone, disabled = false, busy = false, resetKey = 0 }: {
  label: string; holdingLabel?: string; doneLabel?: string; onDone: () => void; disabled?: boolean; busy?: boolean; resetKey?: number
}) {
  const [progress, setProgress] = useState(0)
  const start = useRef<number | null>(null)
  const raf = useRef(0)

  useEffect(() => () => cancelAnimationFrame(raf.current), [])
  useEffect(() => { setProgress(0); start.current = null }, [resetKey])

  const tick = () => {
    if (start.current === null) return
    const p = Math.min(1, (performance.now() - start.current) / HOLD_MS)
    setProgress(p)
    if (p >= 1) {
      start.current = null
      markHuman()
      onDone()
      return
    }
    raf.current = requestAnimationFrame(tick)
  }
  const press = (trusted: boolean) => {
    if (!trusted || disabled || busy || start.current !== null || progress >= 1) return
    start.current = performance.now()
    raf.current = requestAnimationFrame(tick)
  }
  const release = () => {
    if (progress >= 1) return
    start.current = null
    cancelAnimationFrame(raf.current)
    setProgress(0)
  }

  const done = progress >= 1
  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); press(e.isTrusted) }}
      onPointerUp={release}
      onPointerCancel={release}
      onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); press(e.isTrusted) } }}
      onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') release() }}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative h-12 w-full touch-none overflow-hidden rounded-xl text-sm font-semibold select-none transition disabled:cursor-not-allowed disabled:opacity-50 ${done ? 'bg-good text-white' : 'bg-navy-900 text-white hover:bg-navy-800'}`}
      aria-label={`${label} (press and hold)`}
    >
      <span className="absolute inset-y-0 left-0 bg-gold-500/90" style={{ width: `${done ? 0 : progress * 100}%` }} />
      <span className="relative flex items-center justify-center gap-2">
        {done ? <ShieldCheck size={18} /> : <Fingerprint size={18} />}
        {busy ? 'Checking…' : done ? doneLabel : progress > 0 ? holdingLabel : label}
      </span>
    </button>
  )
}

/** Gate for a session restored without the press-and-hold check (new tab, next day). */
export default function HumanCheck({ children }: { children: ReactNode }) {
  const [ok, setOk] = useState(isHumanVerified)
  if (ok) return <>{children}</>
  return (
    <div className="relative grid min-h-screen place-items-center bg-sidebar px-5">
      <div className="absolute top-4 right-4"><ThemeToggle onDark /></div>
      <div className="w-full max-w-sm rounded-3xl bg-surface p-7 text-center shadow-2xl">
        <img src="/gsy-logo.webp" alt="GSY" className="mx-auto h-16 w-16" />
        <div className="mt-3 text-[0.6875rem] font-semibold tracking-[0.18em] text-gold-600 uppercase">Security check</div>
        <h1 className="mt-1 text-xl font-semibold text-navy-900">Confirm it’s you</h1>
        <p className="mt-1 text-sm text-muted">Press and hold the button to confirm you are not a robot.</p>
        <div className="mt-6"><HoldButton label="Press and hold" onDone={() => setTimeout(() => setOk(true), 250)} /></div>
        <p className="mt-4 text-[0.6875rem] text-muted">You are signed in with your GSY account. This check is asked again after 8 hours.</p>
      </div>
    </div>
  )
}
