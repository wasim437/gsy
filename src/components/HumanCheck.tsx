import { Fingerprint, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

const KEY = 'gsy.portal.human'
const HOLD_MS = 2500
const VALID_MS = 8 * 60 * 60 * 1000 // ask again after 8 hours

function verified() {
  try {
    const t = Number(sessionStorage.getItem(KEY))
    return t > 0 && Date.now() - t < VALID_MS
  } catch {
    return false
  }
}

/**
 * "Press and hold" check in front of the Admin Portal. It stops scripts and casual misuse;
 * the real protection is the database's sign-in and access rules.
 */
export default function HumanCheck({ children }: { children: ReactNode }) {
  const [ok, setOk] = useState(verified)
  const [progress, setProgress] = useState(0)
  const start = useRef<number | null>(null)
  const raf = useRef(0)

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  const tick = () => {
    if (start.current === null) return
    const p = Math.min(1, (performance.now() - start.current) / HOLD_MS)
    setProgress(p)
    if (p >= 1) {
      start.current = null
      try { sessionStorage.setItem(KEY, String(Date.now())) } catch { /* private mode */ }
      setTimeout(() => setOk(true), 250)
      return
    }
    raf.current = requestAnimationFrame(tick)
  }
  const press = (trusted: boolean) => {
    if (!trusted || start.current !== null || progress >= 1) return
    start.current = performance.now()
    raf.current = requestAnimationFrame(tick)
  }
  const release = () => {
    if (progress >= 1) return
    start.current = null
    cancelAnimationFrame(raf.current)
    setProgress(0)
  }

  if (ok) return <>{children}</>
  const done = progress >= 1
  return (
    <div className="grid min-h-screen place-items-center bg-navy-900 px-5">
      <div className="w-full max-w-sm rounded-3xl bg-white p-7 text-center shadow-2xl">
        <img src="/gsy-logo.webp" alt="GSY" className="mx-auto h-16 w-16" />
        <div className="mt-3 text-[0.6875rem] font-semibold tracking-[0.18em] text-gold-600 uppercase">Admin Portal</div>
        <h1 className="mt-1 text-xl font-semibold text-navy-900">Security check</h1>
        <p className="mt-1 text-sm text-muted">Press and hold the button to confirm you are not a robot.</p>
        <button
          type="button"
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); press(e.isTrusted) }}
          onPointerUp={release}
          onPointerCancel={release}
          onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); press(e.isTrusted) } }}
          onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') release() }}
          onContextMenu={(e) => e.preventDefault()}
          className={`relative mt-6 h-14 w-full touch-none overflow-hidden rounded-2xl border-2 text-sm font-semibold select-none transition ${done ? 'border-good text-white' : 'border-navy-900 text-navy-900'}`}
          aria-label="Press and hold to verify"
        >
          <span className={`absolute inset-y-0 left-0 ${done ? 'bg-good' : 'bg-gold-500'}`} style={{ width: `${progress * 100}%` }} />
          <span className="relative flex items-center justify-center gap-2">
            {done ? <ShieldCheck size={18} /> : <Fingerprint size={18} />}
            {done ? 'Verified' : progress > 0 ? 'Keep holding…' : 'Press and hold'}
          </span>
        </button>
        <p className="mt-4 text-[0.6875rem] text-muted">You are signed in with your GSY account. This check is asked again after 8 hours.</p>
      </div>
    </div>
  )
}
