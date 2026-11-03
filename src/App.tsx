import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import Intro from './components/Intro'
import HumanCheck from './components/HumanCheck'
import Layout from './components/Layout'
import UpdateNotice from './components/UpdateNotice'
import { adminHref, adminSeparate, dashboardHref, isAdminSite } from './lib/site'
import { useTheme } from './lib/theme'
import { can, useStore, type Permission } from './data/store'
import { ALL_NAV } from './components/Layout'
const ReportBuilder = lazy(() => import('./pages/ReportBuilder'))
const Portal = lazy(() => import('./portal/Portal'))
const Assistant = lazy(() => import('./pages/Assistant'))
const CashFlow = lazy(() => import('./pages/CashFlow'))
const CompanyCommission = lazy(() => import('./pages/CompanyCommission'))
const Contracts = lazy(() => import('./pages/Contracts'))
const Countries = lazy(() => import('./pages/Countries'))
const Home = lazy(() => import('./pages/Home'))
const InternalInvestments = lazy(() => import('./pages/InternalInvestments'))
const InvestorDetail = lazy(() => import('./pages/InvestorDetail'))
const Investors = lazy(() => import('./pages/Investors'))
const Investments = lazy(() => import('./pages/Investments'))
import Login from './pages/Login'
const Payouts = lazy(() => import('./pages/Payouts'))
const Pipeline = lazy(() => import('./pages/Pipeline'))
const Reminders = lazy(() => import('./pages/Reminders'))
const Reports = lazy(() => import('./pages/Reports'))
const SalesCommissions = lazy(() => import('./pages/SalesCommissions'))
const Statement = lazy(() => import('./pages/Statement'))
const MoneyFlow = lazy(() => import('./pages/analytics/MoneyFlow'))
const Portfolio = lazy(() => import('./pages/analytics/Portfolio'))
const SalesPerformance = lazy(() => import('./pages/analytics/SalesPerformance'))
const StressTest = lazy(() => import('./pages/analytics/StressTest'))

function RequireAuth({ children, admin = false }: { children: React.ReactNode; admin?: boolean }) {
  const { user, dbMode, authReady, pendingApproval } = useStore()
  const loc = useLocation()
  if (dbMode && !authReady) return <div className="grid min-h-screen place-items-center text-sm text-muted">Loading…</div>
  if (!user || pendingApproval) return <Navigate to="/login" state={{ from: loc.pathname }} replace />
  if (admin) {
    if (can(user, 'uploadData') || can(user, 'manageUsers')) return <>{children}</>
    return (
      <div className="grid min-h-screen place-items-center px-6 text-center text-sm text-muted">
        <div>Your account can view the dashboard but not enter data. Ask the Chairman for “Enter &amp; edit data”.<br />
          <a href={dashboardHref} className="mt-3 inline-block font-semibold text-gold-600">Open the dashboard →</a></div>
      </div>
    )
  }
  // Page-level permission: match the nav item that owns this path.
  const item = [...ALL_NAV].sort((a, b) => b.to.length - a.to.length).find((n) => n.to !== '/' && loc.pathname.startsWith(n.to))
  const need: Permission = loc.pathname.startsWith('/statement') ? 'downloadStatements' : item?.perm ?? 'viewDashboards'
  if (!can(user, need)) {
    const first = ALL_NAV.find((n) => can(user, n.perm))
    if (first && first.to !== loc.pathname) return <Navigate to={first.to} replace />
    return <div className="grid min-h-[60vh] place-items-center text-sm text-muted">You don’t have access to this page. Ask the Chairman to grant it.</div>
  }
  return <>{children}</>
}

const IDLE_MS = 30 * 60 * 1000
const ACTIVE_KEY = 'gsy.lastActive'

/** Signs out after 30 minutes without a click, key press or scroll, including a tab left open overnight. */
function useIdleSignOut(active: boolean, signOut: () => void) {
  useEffect(() => {
    if (!active) return
    const stamp = () => { try { localStorage.setItem(ACTIVE_KEY, String(Date.now())) } catch { /* storage blocked */ } }
    const last = () => { try { return Number(localStorage.getItem(ACTIVE_KEY)) || Date.now() } catch { return Date.now() } }
    const out = () => {
      try { sessionStorage.setItem('gsy.signedOut', 'You were signed out after 30 minutes without activity. Please sign in again.') } catch { /* storage blocked */ }
      signOut()
    }
    if (Date.now() - last() > IDLE_MS) { out(); return }
    stamp()
    let lastWrite = Date.now()
    const bump = () => { if (Date.now() - lastWrite > 15_000) { lastWrite = Date.now(); stamp() } }
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }))
    const t = setInterval(() => { if (Date.now() - last() > IDLE_MS) out() }, 30_000)
    return () => { clearInterval(t); events.forEach((e) => window.removeEventListener(e, bump)) }
  }, [active, signOut])
}

/** /portal on the dashboard address moves to the Admin Portal's own address. */
function ToAdmin() {
  const { section = '' } = useParams()
  useEffect(() => { location.replace(adminHref(section)) }, [section])
  return <div className="grid min-h-screen place-items-center text-sm text-muted">Opening the Admin Portal…</div>
}

function PageLoading() {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <span className="h-7 w-7 animate-spin rounded-full border-2 border-gold-500 border-t-transparent" aria-label="Loading" />
    </div>
  )
}

function seenIntro() {
  try { return sessionStorage.getItem('gsy.intro') === '1' } catch { return false }
}

export default function App() {
  const theme = useTheme()
  const { user, signOut, dbMode } = useStore()
  useIdleSignOut(dbMode && !!user, signOut)
  const [intro, setIntro] = useState(() => !seenIntro() && !new URLSearchParams(location.search).has('nointro'))
  const done = useCallback(() => {
    setIntro(false)
    try { sessionStorage.setItem('gsy.intro', '1') } catch { /* private mode */ }
  }, [])

  return (
    <>
    {intro && <Intro onDone={done} />}
    <UpdateNotice />
    {/* Remount pages when the theme changes so every chart picks up its light or dark colors. */}
    <Suspense fallback={<PageLoading />}>
    <Routes key={theme}>
      <Route path="/login" element={<Login />} />
      {isAdminSite ? (
        <>
          <Route path="/:section?" element={<RequireAuth admin><HumanCheck><Portal /></HumanCheck></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      ) : (
        <>
          <Route path="/statement/:id" element={<RequireAuth><HumanCheck><Statement /></HumanCheck></RequireAuth>} />
          <Route path="/portal/:section?" element={adminSeparate ? <ToAdmin /> : <RequireAuth admin><HumanCheck><Portal /></HumanCheck></RequireAuth>} />
          <Route element={<RequireAuth><HumanCheck><Layout /></HumanCheck></RequireAuth>}>
            <Route index element={<Home />} />
            <Route path="cash" element={<CashFlow />} />
            <Route path="investments" element={<Investments />} />
            <Route path="payouts" element={<Payouts />} />
            <Route path="contracts" element={<Contracts />} />
            <Route path="internal" element={<InternalInvestments />} />
            <Route path="investors" element={<Investors />} />
            <Route path="investors/:id" element={<InvestorDetail />} />
            <Route path="pipeline" element={<Pipeline />} />
            <Route path="countries" element={<Countries />} />
            <Route path="commission" element={<CompanyCommission />} />
            <Route path="sales" element={<SalesCommissions />} />
            <Route path="reminders" element={<Reminders />} />
            <Route path="reports" element={<Reports />} />
            <Route path="assistant" element={<Assistant />} />
            <Route path="admin" element={<Navigate to={adminSeparate ? '/portal' : '/portal/users'} replace />} />
            <Route path="builder" element={<ReportBuilder />} />
            <Route path="analytics/flow" element={<MoneyFlow />} />
            <Route path="analytics/stress" element={<StressTest />} />
            <Route path="analytics/portfolio" element={<Portfolio />} />
            <Route path="analytics/sales" element={<SalesPerformance />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </>
      )}
    </Routes>
    </Suspense>
    </>
  )
}
