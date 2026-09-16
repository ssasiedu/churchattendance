import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, CalendarCheck, Users, FileText, LogOut, Church } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { CHURCH_NAME } from '../lib/constants'
import { cn } from '../lib/utils'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/services', label: 'Services', icon: CalendarCheck },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/members', label: 'Members', icon: Users },
]

export default function Layout() {
  const { user, signOut } = useAuth()

  return (
    <div className="min-h-screen lg:flex">
      {/* Sidebar (desktop) */}
      <aside className="no-print hidden w-64 shrink-0 flex-col bg-pew-900 text-pew-100 lg:flex">
        <div className="flex items-center gap-3 px-6 py-6">
          <span className="grid size-10 place-items-center rounded-lg bg-pew-600">
            <Church className="size-5 text-brass-300" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-display text-lg leading-tight text-white">{CHURCH_NAME}</p>
            <p className="text-xs text-pew-200">Attendance</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive ? 'bg-pew-600 text-white' : 'text-pew-100 hover:bg-pew-700'
                )
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-pew-700 px-6 py-4">
          <p className="truncate text-xs text-pew-200">{user?.email}</p>
          <button onClick={signOut} className="mt-2 flex items-center gap-2 text-sm text-white hover:text-brass-300">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* Top bar (mobile) */}
      <header className="no-print flex items-center justify-between bg-pew-900 px-4 py-3 text-white lg:hidden">
        <p className="truncate font-display text-lg">{CHURCH_NAME}</p>
        <button onClick={signOut} aria-label="Sign out" className="rounded-md p-2 hover:bg-pew-700">
          <LogOut className="size-5" />
        </button>
      </header>

      <main className="flex-1 px-4 pt-6 pb-28 sm:px-8 lg:pb-10">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>

      {/* Bottom nav (mobile) */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn('flex flex-col items-center gap-1 py-2.5 text-xs font-medium', isActive ? 'text-pew-600' : 'text-slate-500')
            }
          >
            <Icon className="size-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
