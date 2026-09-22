import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate, Link } from 'react-router-dom'
import { Church } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { Button, ErrorNote, Field, inputClass } from '../components/ui'

export default function Login() {
  const { session, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [brand, setBrand] = useState(null)

  // The church name and logo are readable without signing in, so the login page can show them
  useEffect(() => {
    supabase.rpc('get_church_brand').then(({ data }) => setBrand(data))
  }, [])

  if (session) return <Navigate to={location.state?.from?.pathname || '/'} replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await signIn(email.trim(), password)
    setBusy(false)
    if (error) setError('Email or password is incorrect.')
    else navigate(location.state?.from?.pathname || '/', { replace: true })
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-pew-900 p-12 text-pew-100 lg:flex">
        {brand?.logo_url ? (
          <img src={brand.logo_url} alt="" className="size-14 rounded-xl bg-white object-contain p-1" />
        ) : (
          <span className="grid size-12 place-items-center rounded-xl bg-pew-600">
            <Church className="size-6 text-brass-300" />
          </span>
        )}
        <div>
          <p className="font-display text-5xl leading-tight text-white">{brand?.church_name ?? 'Church Management System'}</p>
          <p className="mt-4 max-w-sm text-lg text-pew-200">
            {brand?.motto || 'Attendance, members, giving and church accounts in one place.'}
          </p>
        </div>
        <p className="text-sm text-pew-200">Members check in at <Link to="/checkin" className="underline hover:text-white">/checkin</Link></p>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
          <div>
            <h1 className="font-display text-3xl">Admin sign in</h1>
            <p className="mt-1 text-slate-600">For pastors, secretaries and ushers.</p>
          </div>
          <ErrorNote error={error} />
          <Field label="Email">
            <input type="email" required autoComplete="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password">
            <input type="password" required autoComplete="current-password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={busy}>Sign in</Button>
          <p className="text-center text-sm text-slate-500 lg:hidden">
            Checking in? <Link to="/checkin" className="font-medium text-pew-600 underline">Go to check-in</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
