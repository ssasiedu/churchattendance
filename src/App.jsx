import { Routes, Route, Navigate } from 'react-router-dom'
import { isConfigured } from './lib/supabase'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import SetupNotice from './components/SetupNotice'
import CheckIn from './pages/CheckIn'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Services from './pages/Services'
import Members from './pages/Members'
import Reports from './pages/Reports'

export default function App() {
  if (!isConfigured) return <SetupNotice />

  return (
    <Routes>
      {/* Public */}
      <Route path="/checkin" element={<CheckIn />} />
      <Route path="/checkin/:serviceId" element={<CheckIn />} />
      <Route path="/login" element={<Login />} />

      {/* Admin */}
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="services" element={<Services />} />
        <Route path="members" element={<Members />} />
        <Route path="reports" element={<Reports />} />
        <Route path="reports/:serviceId" element={<Reports />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
