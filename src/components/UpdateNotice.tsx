import { RefreshCw, Sparkles, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { APP_VERSION, CHANGELOG } from '../data/changelog'

const SEEN = 'gsy.seenVersion'
const CHECK_MS = 2 * 60 * 1000

/**
 * Tells people about updates: a "new version ready" bar when a newer build is published while the
 * app is open, and a one-time "what's new" card after the update reaches them.
 */
export default function UpdateNotice({ signedIn }: { signedIn: boolean }) {
  const [newer, setNewer] = useState(false)
  const [seen, setSeen] = useState(() => { try { return localStorage.getItem(SEEN) } catch { return APP_VERSION } })

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

  const markSeen = () => {
    try { localStorage.setItem(SEEN, APP_VERSION) } catch { /* storage blocked */ }
    setSeen(APP_VERSION)
  }
  const release = CHANGELOG[0]

  return (
    <>
      {newer && (
        <div className="no-print fixed inset-x-0 top-0 z-[90] flex items-center justify-center gap-3 bg-gold-500 px-4 py-2 text-sm font-semibold text-navy-950 shadow-lg">
          <Sparkles size={16} /> A new update of GSY is ready.
          <button onClick={() => location.reload()} className="inline-flex items-center gap-1.5 rounded-lg bg-navy-950 px-3 py-1 text-xs font-semibold text-white"><RefreshCw size={13} /> Update now</button>
        </div>
      )}
      {signedIn && seen !== APP_VERSION && (
        <div className="no-print fixed right-4 bottom-20 z-[85] w-[min(92vw,360px)] rounded-2xl border border-line bg-surface p-4 shadow-2xl lg:bottom-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-wider text-gold-600 uppercase"><Sparkles size={13} /> Updated to v{release.version}</div>
              <div className="mt-0.5 text-sm font-semibold">{release.title}</div>
            </div>
            <button onClick={markSeen} className="rounded-lg p-1 text-muted hover:bg-gold-50" aria-label="Close"><X size={16} /></button>
          </div>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-xs text-ink-2">
            {release.items.slice(0, 4).map((i) => <li key={i}>{i}</li>)}
          </ul>
          <button onClick={markSeen} className="mt-3 w-full rounded-xl bg-navy-900 py-2 text-xs font-semibold text-white hover:bg-navy-800">Got it</button>
        </div>
      )}
    </>
  )
}
