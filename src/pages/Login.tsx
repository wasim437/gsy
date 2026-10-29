import { KeyRound, Lock, Mail, ShieldCheck, Smartphone } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useStore, type User } from '../data/store'

export default function Login() {
  const { signIn, users, user } = useStore()
  const DEMO_USERS = users.filter((u) => u.status === 'Active')
  const nav = useNavigate()
  const loc = useLocation() as { state?: { from?: string } }
  const [email, setEmail] = useState(DEMO_USERS[0].email)
  const [password, setPassword] = useState('••••••••••')
  const [step, setStep] = useState<'creds' | 'otp'>('creds')
  const [otp, setOtp] = useState('')
  const [err, setErr] = useState('')
  const [pending, setPending] = useState<User | null>(null)

  if (user) return <Navigate to={loc.state?.from ?? '/'} replace />

  const submitCreds = (e: FormEvent) => {
    e.preventDefault()
    const u = DEMO_USERS.find((x) => x.email.toLowerCase() === email.trim().toLowerCase())
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
      <div className="relative hidden overflow-hidden bg-navy-900 p-12 text-white lg:flex lg:flex-col">
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

      <div className="flex items-center justify-center px-5 py-10">
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
              <div className="rounded-xl border border-dashed border-gold-500/50 bg-gold-50 p-3 text-xs text-ink-2">
                <div className="mb-1.5 font-semibold text-gold-600">Layout preview: choose a role</div>
                <div className="flex flex-wrap gap-1.5">
                  {DEMO_USERS.map((u) => (
                    <button type="button" key={u.id} onClick={() => setEmail(u.email)} className={`rounded-full border px-2.5 py-1 ${email === u.email ? 'border-navy-900 bg-navy-900 text-white' : 'border-line bg-white hover:border-gold-500'}`}>
                      {u.name}
                    </button>
                  ))}
                </div>
              </div>
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
