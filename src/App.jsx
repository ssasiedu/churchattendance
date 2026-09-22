import { Routes, Route, Navigate } from 'react-router-dom'
import { isConfigured } from './lib/supabase'
import { SettingsProvider } from './context/SettingsContext'
import ProtectedRoute from './components/ProtectedRoute'
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
        <Route path="services" element={<Services />} />
        <Route path="members" element={<Members />} />
        <Route path="members/:memberId" element={<MemberProfile />} />
        <Route path="reports" element={<Reports />} />
        <Route path="reports/:serviceId" element={<Reports />} />
        <Route path="sms" element={<Sms />} />
        <Route path="contributions" element={<Contributions />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="accounts" element={<ChartOfAccounts />} />
        <Route path="journal" element={<Journal />} />
        <Route path="finance-reports" element={<FinanceReports />} />
        <Route path="assets" element={<Assets />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
