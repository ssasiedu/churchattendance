import { Link } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { useSettings } from '../context/SettingsContext'

/** Wraps a page so people only reach what their role allows */
export default function RequirePermission({ permission, children }) {
  const { can, profile } = useSettings()
  if (!permission || can(permission)) return children

  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
      <Lock className="mx-auto size-8 text-slate-400" />
      <h1 className="mt-3 font-display text-2xl">This page isn’t part of your role</h1>
      <p className="mt-2 text-slate-600">
        You are signed in as {profile?.role ?? 'a user without a role'}. Ask an administrator if you need access.
      </p>
      <Link to="/" className="mt-5 inline-block font-medium text-pew-600 underline">Back to the dashboard</Link>
    </div>
  )
}
