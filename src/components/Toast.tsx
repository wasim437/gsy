import { CheckCircle2, XCircle } from 'lucide-react'
import { useStore } from '../data/store'

/** "Saved" / error message. Full width at the bottom on phones (above the tab bar), a small card on desktop. */
export default function Toast({ aboveTabs = false }: { aboveTabs?: boolean }) {
  const { notice } = useStore()
  if (!notice) return null
  return (
    <div
      role="status"
      className={`no-print fixed inset-x-3 z-[80] flex items-start gap-2 rounded-xl px-4 py-3 text-sm shadow-xl sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-w-sm ${aboveTabs ? 'bottom-[calc(4.25rem+env(safe-area-inset-bottom))]' : 'bottom-[calc(0.75rem+env(safe-area-inset-bottom))]'} ${notice.kind === 'ok' ? 'bg-navy-900 text-white' : 'bg-bad text-white'}`}
    >
      {notice.kind === 'ok' ? <CheckCircle2 size={17} className="mt-0.5 shrink-0" /> : <XCircle size={17} className="mt-0.5 shrink-0" />}
      <span className="min-w-0">{notice.text}</span>
    </div>
  )
}
