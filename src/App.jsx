import { Routes, Route, Navigate } from 'react-router-dom'
import { isConfigured } from './lib/supabase'
import { SettingsProvider } from './context/SettingsContext'
import ProtectedRoute from './components/ProtectedRoute'
import RequirePermission from './components/RequirePermission'
import Layout from './components/Layout'
import SetupNotice from './components/SetupNotice'
import CheckIn from './pages/CheckIn'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Services from './pages/Services'
import Members from './pages/Members'
import MemberProfile from './pages/MemberProfile'
import Reports from './pages/Reports'
import Sms from './pages/Sms'
import Contributions from './pages/Contributions'
import Expenses from './pages/Expenses'
import ChartOfAccounts from './pages/ChartOfAccounts'
import Journal from './pages/Journal'
import FinanceReports from './pages/FinanceReports'
import Assets from './pages/Assets'
import Billing from './pages/Billing'
import Birthdays from './pages/Birthdays'
import Settings from './pages/Settings'

export default function App() {
  if (!isConfigured) return <SetupNotice />

  return (
    <Routes>
      <Route path="/checkin" element={<CheckIn />} />
      <Route path="/checkin/:serviceId" element={<CheckIn />} />
      <Route path="/login" element={<Login />} />

      <Route
        element={
          <ProtectedRoute>
            <SettingsProvider>
              <Layout />
            </SettingsProvider>
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="members" element={<Members />} />
        <Route path="members/:memberId" element={<MemberProfile />} />
        <Route path="birthdays" element={<Birthdays />} />
        <Route path="services" element={<Guard need="attendance.manage"><Services /></Guard>} />
        <Route path="reports" element={<Guard need="reports.view"><Reports /></Guard>} />
        <Route path="reports/:serviceId" element={<Guard need="reports.view"><Reports /></Guard>} />
        <Route path="sms" element={<Guard need="sms.send"><Sms /></Guard>} />
        <Route path="contributions" element={<Guard need="finance.view"><Contributions /></Guard>} />
        <Route path="billing" element={<Guard need="finance.view"><Billing /></Guard>} />
        <Route path="expenses" element={<Guard need="finance.view"><Expenses /></Guard>} />
        <Route path="accounts" element={<Guard need="finance.manage"><ChartOfAccounts /></Guard>} />
        <Route path="journal" element={<Guard need="finance.manage"><Journal /></Guard>} />
        <Route path="finance-reports" element={<Guard need="finance.view"><FinanceReports /></Guard>} />
        <Route path="assets" element={<Guard need="assets.manage"><Assets /></Guard>} />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function Guard({ need, children }) {
  return <RequirePermission permission={need}>{children}</RequirePermission>
}
