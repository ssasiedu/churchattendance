import { Navigate, useLocation } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Button, Spinner } from './ui'

export default function ProtectedRoute({ children }) {
  const { session, isAdmin, loading, signOut, user } = useAuth()
  const location = useLocation()

  if (loading) return <Spinner label="Checking your sign-in…" />
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />

  if (!isAdmin) {
    return (
      <div className="mx-auto mt-24 max-w-md px-6 text-center">
        <ShieldAlert className="mx-auto size-10 text-brass-500" />
        <h1 className="mt-4 font-display text-2xl">This account can't manage attendance</h1>
        <p className="mt-2 text-slate-600">
          {user?.email} is signed in but isn't on the admin list. Ask your administrator to add it in Supabase
          (see README, step 4).
        </p>
        <Button variant="outline" className="mt-6" onClick={signOut}>Sign out</Button>
      </div>
    )
  }

  return children
}
