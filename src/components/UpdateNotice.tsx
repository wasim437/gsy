import { RefreshCw, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'

const CHECK_MS = 2 * 60 * 1000

/** A slim "update ready" bar when a newer build is published while the app is open. Update notes live in Admin Portal → History. */
export default function UpdateNotice() {
  const [newer, setNewer] = useState(false)

  useEffect(() => {
    if (import.meta.env.DEV) return
    let stop = false
    const check = async () => {
      try {
        const r = await fetch('/version.json', { cache: 'no-store' })
        const v = (await r.json()) as { id?: string }
        if (!stop && v.id && v.id !== __BUILD_ID__) setNewer(true)
      } catch { /* offline: try again later */ }
    }
    const t = setInterval(() => void check(), CHECK_MS)
    const onFocus = () => { if (document.visibilityState === 'visible') void check() }
    document.addEventListener('visibilitychange', onFocus)
    return () => { stop = true; clearInterval(t); document.removeEventListener('visibilitychange', onFocus) }
  }, [])

  if (!newer) return null
  return (
    <button
      onClick={() => location.reload()}
      className="no-print fixed inset-x-0 top-0 z-[90] flex items-center justify-center gap-2 bg-gold-500 px-3 pt-[calc(0.4rem+env(safe-area-inset-top))] pb-1.5 text-xs font-semibold text-navy-950 shadow-lg sm:text-sm"
    >
      <Sparkles size={14} className="shrink-0" /> New update ready
      <span className="inline-flex items-center gap-1 rounded-md bg-navy-950 px-2 py-0.5 text-[0.6875rem] text-white"><RefreshCw size={12} /> Tap to update</span>
    </button>
  )
}
