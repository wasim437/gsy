import { useCallback, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Intro from './components/Intro'
import Layout from './components/Layout'
import { can, useStore, type Permission } from './data/store'
import { ALL_NAV } from './components/Layout'
import ReportBuilder from './pages/ReportBuilder'
import Admin from './pages/Admin'
import Assistant from './pages/Assistant'
import CashFlow from './pages/CashFlow'
import CompanyCommission from './pages/CompanyCommission'
import Contracts from './pages/Contracts'
import Countries from './pages/Countries'
import DataSources from './pages/DataSources'
import Home from './pages/Home'
import InternalInvestments from './pages/InternalInvestments'
import InvestorDetail from './pages/InvestorDetail'
import Investors from './pages/Investors'
import Investments from './pages/Investments'
import Login from './pages/Login'
import Payouts from './pages/Payouts'
import Pipeline from './pages/Pipeline'
import Reminders from './pages/Reminders'
import Reports from './pages/Reports'
import SalesCommissions from './pages/SalesCommissions'
import Statement from './pages/Statement'
import MoneyFlow from './pages/analytics/MoneyFlow'
import Portfolio from './pages/analytics/Portfolio'
import SalesPerformance from './pages/analytics/SalesPerformance'
import StressTest from './pages/analytics/StressTest'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user } = useStore()
  const loc = useLocation()
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />
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

function seenIntro() {
  try { return sessionStorage.getItem('gsy.intro') === '1' } catch { return false }
}

export default function App() {
  const [intro, setIntro] = useState(() => !seenIntro() && !new URLSearchParams(location.search).has('nointro'))
  const done = useCallback(() => {
    setIntro(false)
    try { sessionStorage.setItem('gsy.intro', '1') } catch { /* private mode */ }
  }, [])

  return (
    <>
    {intro && <Intro onDone={done} />}
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/statement/:id" element={<RequireAuth><Statement /></RequireAuth>} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
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
        <Route path="data" element={<DataSources />} />
        <Route path="admin" element={<Admin />} />
        <Route path="builder" element={<ReportBuilder />} />
        <Route path="analytics/flow" element={<MoneyFlow />} />
        <Route path="analytics/stress" element={<StressTest />} />
        <Route path="analytics/portfolio" element={<Portfolio />} />
        <Route path="analytics/sales" element={<SalesPerformance />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </>
  )
}
