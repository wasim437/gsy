import { Eye, EyeOff, Fingerprint, KeyRound, Loader2, Lock, Mail, ShieldCheck, Smartphone, UserRound } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { HoldButton } from '../components/HumanCheck'
import { ThemeToggle } from '../components/ui'
import { isAdminSite } from '../lib/site'
import { supabase } from '../lib/supabase'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useStore, type User } from '../data/store'

export default function Login() {
  const { dbMode } = useStore()
  return dbMode ? <DbLogin /> : <DemoLogin />
}

const LOCK_KEY = 'gsy.login.lock'
const MAX_FAILS = 5
const LOCK_MS = 5 * 60 * 1000

function readLock(): { fails: number; until: number } {
  try { return { fails: 0, until: 0, ...JSON.parse(localStorage.getItem(LOCK_KEY) ?? '{}') } } catch { return { fails: 0, until: 0 } }
}
function writeLock(v: { fails: number; until: number }) {
  try { localStorage.setItem(LOCK_KEY, JSON.stringify(v)) } catch { /* storage blocked */ }
}

/** Real sign-in against GSY's Supabase accounts. */
function DbLogin() {
  const { user, pendingApproval, sessionEmail, signOut, authReady } = useStore()
  const loc = useLocation() as { state?: { from?: string }; search: string }
  const invite = new URLSearchParams(loc.search).get('invite') ?? ''
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>(invite ? 'signup' : 'signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState(invite)
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [reset, setReset] = useState(0)
  const [lock, setLock] = useState(readLock)
  const [now, setNow] = useState(Date.now())
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(() => {
    try {
      const why = sessionStorage.getItem('gsy.signedOut')
      sessionStorage.removeItem('gsy.signedOut')
      return why ? { ok: true, text: why } : null
    } catch { return null }
  })

  const locked = lock.until > now
  useEffect(() => {
    if (!locked) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [locked])

  if (user) return <Navigate to={loc.state?.from ?? '/'} replace />

  const ready = email.trim() !== '' && (mode === 'reset' || password !== '') && (mode !== 'signup' || name.trim() !== '')
  const fail = (text: string) => {
    setMsg({ ok: false, text })
    setReset((r) => r + 1)
  }

  const submit = async () => {
    if (locked || !ready) return
    setBusy(true)
    setMsg(null)
    try { localStorage.setItem('gsy.lastActive', String(Date.now())) } catch { /* storage blocked */ }
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
        writeLock({ fails: 0, until: 0 })
      } else if (mode === 'signup') {
        if (password.length < 8) throw new Error('Use at least 8 characters for the password.')
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name.trim() }, emailRedirectTo: window.location.origin } })
        if (error) throw error
        setMsg({ ok: true, text: data.session ? 'Account created.' : 'Account created. Check your email to confirm it, then sign in.' })
        setReset((r) => r + 1)
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + '/login' })
        if (error) throw error
        setMsg({ ok: true, text: 'If this email has an account, a reset link is on its way.' })
        setReset((r) => r + 1)
      }
    } catch (err) {
      const t = (err as Error).message
      if (mode === 'signin' && /invalid login/i.test(t)) {
        const fails = lock.fails + 1
        const next = fails >= MAX_FAILS ? { fails: 0, until: Date.now() + LOCK_MS } : { fails, until: 0 }
        writeLock(next)
        setLock(next)
        setNow(Date.now())
        fail(next.until ? 'Too many wrong passwords. Sign-in is locked for 5 minutes.' : `Email or password is not correct. ${MAX_FAILS - fails} ${MAX_FAILS - fails === 1 ? 'try' : 'tries'} left before a 5-minute lock.`)
      } else {
        fail(/not confirmed/i.test(t) ? 'Please confirm your email first (check your inbox).'
          : /rate limit|too many/i.test(t) ? 'Too many attempts. Please wait a few minutes and try again.'
          : /failed to fetch|network|load failed/i.test(t) ? 'Cannot reach the GSY server. Check the internet connection and try again.'
          : t)
      }
    } finally {
      setBusy(false)
    }
  }
  const onEnter = (e: FormEvent) => {
    e.preventDefault()
    setMsg({ ok: true, text: 'Press and hold the button to continue.' })
  }
  const left = Math.max(0, Math.ceil((lock.until - now) / 1000))
  const switchTo = (m: typeof mode) => { setMode(m); setMsg(null); setReset((r) => r + 1) }

  return (
    <Shell>
      {pendingApproval ? (
        <div className="mt-6 rounded-2xl border border-gold-500/40 bg-gold-50 p-5 text-sm">
          <div className="font-semibold">Waiting for approval</div>
          <p className="mt-1 text-ink-2">{sessionEmail} is signed in, but the Chairman has not given this account access yet. Please ask the Chairman to approve it in Users &amp; Access.</p>
          <button onClick={signOut} className="mt-4 text-sm font-medium text-gold-600 hover:underline">Sign out</button>
        </div>
      ) : !authReady ? (
        <div className="mt-10 flex justify-center"><Loader2 className="animate-spin text-gold-600" /></div>
      ) : (
        <>
          <h2 className="text-xl font-semibold">{mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create your account' : 'Reset password'}</h2>
          <p className="mt-1 text-sm text-muted">{mode === 'signup' ? 'Use the email the Chairman invited.' : 'Use your GSY account. The same password works on the dashboard and the Admin Portal.'}</p>
          <form onSubmit={onEnter} className="mt-6 flex flex-col gap-4">
            {mode === 'signup' && (
              <Field icon={<UserRound size={16} />} label="Full name">
                <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" className="w-full bg-transparent outline-none" />
              </Field>
            )}
            <Field icon={<Mail size={16} />} label="Email">
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required autoComplete="username" className="w-full bg-transparent outline-none" />
            </Field>
            {mode !== 'reset' && (
              <Field icon={<KeyRound size={16} />} label="Password">
                <input value={password} onChange={(e) => setPassword(e.target.value)} type={show ? 'text' : 'password'} required autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} className="w-full bg-transparent outline-none" />
                <button type="button" onClick={() => setShow((v) => !v)} className="text-muted hover:text-ink" aria-label={show ? 'Hide password' : 'Show password'} title={show ? 'Hide password' : 'Show password'}>
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </Field>
            )}
            {msg && <p className={`text-sm ${msg.ok ? 'text-good' : 'text-bad'}`}>{msg.text}</p>}
            {locked ? (
              <div className="flex h-12 items-center justify-center gap-2 rounded-xl bg-bad-bg text-sm font-semibold text-bad"><Lock size={16} /> Locked · try again in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</div>
            ) : (
              <HoldButton
                label={mode === 'signin' ? 'Press and hold to sign in' : mode === 'signup' ? 'Press and hold to create account' : 'Press and hold to send link'}
                doneLabel={mode === 'signin' ? 'Signing in…' : 'Done'}
                disabled={!ready}
                busy={busy}
                resetKey={reset}
                onDone={() => void submit()}
              />
            )}
            <p className="-mt-1 flex items-center justify-center gap-1.5 text-[0.6875rem] text-muted"><ShieldCheck size={12} /> Holding the button proves you are not a robot</p>
          </form>
          <div className="mt-5 flex flex-wrap justify-between gap-2 text-sm">
            {mode !== 'signin' ? <button onClick={() => switchTo('signin')} className="text-muted hover:text-ink">← Back to sign in</button> : (
              <>
                <button onClick={() => switchTo('signup')} className="font-medium text-gold-600 hover:underline">Invited? Create your account</button>
                <button onClick={() => switchTo('reset')} className="text-muted hover:text-ink">Forgot password?</button>
              </>
            )}
          </div>
        </>
      )}
      <p className="mt-10 text-center text-[0.6875rem] text-muted">Access is limited to people the Chairman approves. Every sign-in is logged, and you are signed out after 30 minutes without activity.</p>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  const site = isAdminSite ? 'Admin Portal' : 'Investor Monitor'
  return (
    <div className="grid min-h-screen bg-page lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-sidebar p-12 text-white lg:flex lg:flex-col">
        <div className="absolute -top-40 -right-40 h-[520px] w-[520px] rounded-full border-[40px] border-gold-500/10" />
        <div className="flex items-center gap-3"><img src="/gsy-logo.webp" alt="GSY" className="h-14 w-14 rounded-2xl bg-white/95 p-1" /><div><div className="text-sm font-semibold tracking-[0.2em] text-gold-400">GSY INVESTMENT GROUP</div><div className="text-xs text-white/60">{site}</div></div></div>
        <div className="mt-auto max-w-lg">
          {isAdminSite ? (
            <h1 className="text-4xl leading-tight font-semibold">Enter it once.<br />Check it here.<br /><span className="text-gold-400">See it on the dashboard.</span></h1>
          ) : (
            <h1 className="text-4xl leading-tight font-semibold">Know what came in.<br />Know what is due.<br /><span className="text-gold-400">Know what needs attention.</span></h1>
          )}
          <p className="mt-5 text-white/60">{isAdminSite ? 'Investors, investments, payouts, commissions, expenses and leads, entered by the team and shown to the Chairman at once.' : 'Investor receipts, payouts, commissions and daily cash, entered once and available on any device.'}</p>
          <div className="mt-10 grid grid-cols-3 gap-4 text-xs text-white/70">
            <div className="flex items-center gap-2"><ShieldCheck size={16} className="text-gold-400" />Approved people only</div>
            <div className="flex items-center gap-2"><Fingerprint size={16} className="text-gold-400" />Robot check</div>
            <div className="flex items-center gap-2"><Lock size={16} className="text-gold-400" />Locks after 5 wrong tries</div>
          </div>
        </div>
      </div>
      <div className="relative flex items-center justify-center px-5 py-10">
        <div className="absolute top-4 right-4"><ThemeToggle /></div>
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <img src="/gsy-logo.webp" alt="GSY" className="mb-3 h-16 w-16" />
            <div className="text-xs font-semibold tracking-[0.2em] text-gold-600">GSY INVESTMENT GROUP</div>
            <div className="mt-1 text-2xl font-semibold">{site}</div>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}

/** Demo sign-in (no database configured). */
function DemoLogin() {
  const { signIn, users, user } = useStore()
  const active = users.filter((u) => u.status === 'Active')
  const nav = useNavigate()
  const loc = useLocation() as { state?: { from?: string } }
  const [email, setEmail] = useState('chairman@gsy.example')
  const [password, setPassword] = useState('••••••••••')
  const [step, setStep] = useState<'creds' | 'otp'>('creds')
  const [otp, setOtp] = useState('')
  const [err, setErr] = useState('')
  const [pending, setPending] = useState<User | null>(null)

  if (user) return <Navigate to={loc.state?.from ?? '/'} replace />

  const submitCreds = (e: FormEvent) => {
    e.preventDefault()
    const u = active.find((x) => x.email.toLowerCase() === email.trim().toLowerCase())
    if (!u || !password) return setErr('Unknown or disabled account. Only named GSY users can sign in.')
    setErr('')
    setPending(u)
    setStep('otp')
  }
  const submitOtp = (e: FormEvent) => {
    e.preventDefault()
    if (otp.replace(/\D/g, '').length !== 6) return setErr('Enter the 6-digit code.')
    signIn(pending!)
    nav(loc.state?.from ?? '/', { replace: true })
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-sidebar p-12 text-white lg:flex lg:flex-col">
        <div className="absolute -top-40 -right-40 h-[520px] w-[520px] rounded-full border-[40px] border-gold-500/10" />
        <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-gold-500/5" />
        <div className="flex items-center gap-3"><img src="/gsy-logo.webp" alt="GSY" className="h-14 w-14 rounded-2xl bg-white/95 p-1" /><div className="text-sm font-semibold tracking-[0.2em] text-gold-400">GSY INVESTMENT GROUP</div></div>
        <div className="mt-auto max-w-lg">
          <h1 className="text-4xl leading-tight font-semibold">
            Know what came in.<br />Know what is due.<br /><span className="text-gold-400">Know what needs attention.</span>
          </h1>
          <p className="mt-5 text-white/60">Investor receipts, payouts, commissions and daily cash, reconciled with Accounts and available on any device.</p>
          <div className="mt-10 grid grid-cols-3 gap-4 text-xs text-white/70">
            <div className="flex items-center gap-2"><ShieldCheck size={16} className="text-gold-400" />Named accounts</div>
            <div className="flex items-center gap-2"><Smartphone size={16} className="text-gold-400" />2-step verification</div>
            <div className="flex items-center gap-2"><Lock size={16} className="text-gold-400" />Read-only executive view</div>
          </div>
        </div>
      </div>

      <div className="relative flex items-center justify-center px-5 py-10">
        <div className="absolute top-4 right-4"><ThemeToggle /></div>
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <img src="/gsy-logo.webp" alt="GSY" className="mb-3 h-16 w-16" />
            <div className="text-xs font-semibold tracking-[0.2em] text-gold-600">GSY INVESTMENT GROUP</div>
            <div className="mt-1 text-2xl font-semibold">Investor Monitor</div>
          </div>
          <h2 className="text-xl font-semibold">{step === 'creds' ? 'Sign in' : 'Verify it’s you'}</h2>
          <p className="mt-1 text-sm text-muted">{step === 'creds' ? 'Use your GSY company account.' : `We sent a 6-digit code to ${pending?.email}.`}</p>

          {step === 'creds' ? (
            <form onSubmit={submitCreds} className="mt-6 flex flex-col gap-4">
              <Field icon={<Mail size={16} />} label="Email">
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" className="w-full bg-transparent outline-none" />
              </Field>
              <Field icon={<KeyRound size={16} />} label="Password">
                <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" className="w-full bg-transparent outline-none" />
              </Field>
              {err && <p className="text-sm text-bad">{err}</p>}
              <button type="submit" className="h-11 rounded-xl bg-navy-900 font-medium text-white hover:bg-navy-800">Continue</button>
              <p className="text-center text-[0.6875rem] text-muted">Preview sign-in: <b className="text-ink-2">chairman@gsy.example</b> (any password)</p>
            </form>
          ) : (
            <form onSubmit={submitOtp} className="mt-6 flex flex-col gap-4">
              <Field icon={<Smartphone size={16} />} label="Verification code">
                <input value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" maxLength={7} placeholder="123 456" autoFocus className="num w-full bg-transparent tracking-[0.3em] outline-none" />
              </Field>
              {err && <p className="text-sm text-bad">{err}</p>}
              <button type="submit" className="h-11 rounded-xl bg-navy-900 font-medium text-white hover:bg-navy-800">Verify & open dashboard</button>
              <button type="button" onClick={() => { setOtp('123456') }} className="text-xs text-muted underline">Preview: fill a demo code</button>
              <button type="button" onClick={() => { setStep('creds'); setErr('') }} className="text-sm text-muted hover:text-ink">← Back</button>
            </form>
          )}
          <p className="mt-10 text-center text-[0.6875rem] text-muted">Access is limited to named users. Every sign-in is logged.</p>
        </div>
      </div>
    </div>
  )
}

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      <span className="flex h-11 items-center gap-2.5 rounded-xl border border-line bg-surface px-3 text-sm focus-within:border-gold-500 focus-within:ring-2 focus-within:ring-gold-500/20">
        <span className="text-muted">{icon}</span>
        {children}
      </span>
    </label>
  )
}
