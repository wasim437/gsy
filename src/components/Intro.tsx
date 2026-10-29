import { useEffect, useState } from 'react'

/**
 * Opening motion sequence: orbit rings draw in, the GSY globe lands with a glow,
 * the name reveals letter by letter, then a gold sweep wipes into the app.
 * Plays once per browser session; tap anywhere to skip. Honours reduced-motion.
 */
export default function Intro({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const t1 = setTimeout(() => setLeaving(true), reduce ? 600 : 3300)
    const t2 = setTimeout(onDone, reduce ? 900 : 4000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [onDone])

  const title = 'GSY INVESTMENT GROUP'
  return (
    <div
      onClick={() => { setLeaving(true); setTimeout(onDone, 450) }}
      className={`intro fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-navy-950 ${leaving ? 'intro-leave' : ''}`}
      role="presentation"
    >
      {/* starfield + radial glow */}
      <div className="intro-glow absolute inset-0" />
      {Array.from({ length: 28 }, (_, i) => (
        <span key={i} className="intro-star absolute rounded-full bg-gold-400" style={{ left: `${(i * 37) % 100}%`, top: `${(i * 53) % 100}%`, width: (i % 3) + 1, height: (i % 3) + 1, animationDelay: `${(i % 7) * 0.25}s` }} />
      ))}

      <div className="relative grid h-64 w-64 place-items-center sm:h-80 sm:w-80">
        {/* orbit rings */}
        <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full">
          <ellipse cx="100" cy="100" rx="94" ry="34" fill="none" stroke="#c9a24d" strokeWidth="1.2" className="intro-orbit" transform="rotate(-18 100 100)" />
          <ellipse cx="100" cy="100" rx="80" ry="80" fill="none" stroke="#c9a24d" strokeOpacity="0.25" strokeWidth="0.8" className="intro-orbit intro-orbit-2" />
          <circle r="3" fill="#f3d48a" className="intro-satellite">
            <animateMotion dur="2.6s" repeatCount="indefinite" path="M 6,100 a 94,34 0 1,0 188,0 a 94,34 0 1,0 -188,0" rotate="auto" />
          </circle>
        </svg>
        <img src="/gsy-logo.webp" alt="GSY" className="intro-logo relative h-40 w-40 drop-shadow-[0_0_40px_rgba(201,162,77,0.45)] sm:h-52 sm:w-52" />
      </div>

      <div className="relative mt-4 flex flex-col items-center px-6 text-center">
        <div className="text-[0.95rem] font-semibold tracking-[0.35em] text-white sm:text-lg">
          {title.split('').map((ch, i) => (
            <span key={i} className="intro-letter inline-block" style={{ animationDelay: `${1.0 + i * 0.045}s` }}>{ch === ' ' ? ' ' : ch}</span>
          ))}
        </div>
        <div className="intro-tag mt-3 text-xs tracking-[0.25em] text-gold-400 uppercase sm:text-sm">Investor Monitor</div>
        <div className="mt-6 h-[2px] w-48 overflow-hidden rounded-full bg-white/10">
          <div className="intro-bar h-full bg-gradient-to-r from-gold-600 via-gold-400 to-gold-600" />
        </div>
      </div>

      <div className="intro-sweep pointer-events-none absolute inset-0" />
      <span className="absolute bottom-6 text-[0.6875rem] text-white/30">Tap to skip</span>
    </div>
  )
}
