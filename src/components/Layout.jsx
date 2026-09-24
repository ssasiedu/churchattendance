import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, CalendarCheck, Users, FileText, MessageSquare, HandCoins, Receipt,
  BookOpen, NotebookPen, PieChart, Package, Settings as SettingsIcon, LogOut, Church, Menu, X,
  FileSpreadsheet, Cake,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { cn } from '../lib/utils'
import { Spinner } from './ui'

const SECTIONS = [
  {
    title: 'Attendance',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/services', label: 'Services', icon: CalendarCheck, need: 'attendance.manage' },
      { to: '/reports', label: 'Service reports', icon: FileText, need: 'reports.view' },
      { to: '/members', label: 'Members', icon: Users },
      { to: '/birthdays', label: 'Birthdays', icon: Cake },
      { to: '/sms', label: 'SMS', icon: MessageSquare, need: 'sms.send' },
    ],
  },
  {
    title: 'Finance',
    need: 'finance.view',
    items: [
      { to: '/contributions', label: 'Contributions', icon: HandCoins, need: 'finance.view' },
      { to: '/billing', label: 'Billing and balances', icon: FileSpreadsheet, need: 'finance.view' },
      { to: '/expenses', label: 'Expenses', icon: Receipt, need: 'finance.view' },
      { to: '/journal', label: 'Journal entries', icon: NotebookPen, need: 'finance.manage' },
      { to: '/accounts', label: 'Chart of accounts', icon: BookOpen, need: 'finance.manage' },
      { to: '/finance-reports', label: 'Financial reports', icon: PieChart, need: 'finance.view' },
    ],
  },
  {
    title: 'Church',
    items: [
      { to: '/assets', label: 'Fixed assets', icon: Package, need: 'assets.manage' },
      { to: '/settings', label: 'Settings', icon: SettingsIcon },
    ],
  },
]

const QUICK = [
  { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/services', label: 'Services', icon: CalendarCheck, need: 'attendance.manage' },
  { to: '/members', label: 'Members', icon: Users },
  { to: '/contributions', label: 'Money', icon: HandCoins, need: 'finance.view' },
  { to: '/sms', label: 'SMS', icon: MessageSquare, need: 'sms.send' },
]

export default function Layout() {
  const { user, signOut } = useAuth()
  const { settings, loading, profile, can, needsUpgrade } = useSettings()
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  if (loading) return <Spinner label="Loading your church…" />

  const brand = (
    <div className="flex items-center gap-3">
      {settings?.logo_url ? (
        <img src={settings.logo_url} alt="" className="size-10 shrink-0 rounded-lg bg-white object-contain p-0.5" />
      ) : (
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-pew-600">
          <Church className="size-5 text-brass-300" />
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate font-display text-lg leading-tight text-white">{settings?.church_name}</p>
        <p className="truncate text-xs text-pew-200">{settings?.location || settings?.denomination || 'Church management'}</p>
      </div>
    </div>
  )

  const allowed = (item) => !item.need || can(item.need)
  const sections = SECTIONS
    .filter((section) => !section.need || can(section.need))
    .map((section) => ({ ...section, items: section.items.filter(allowed) }))
    .filter((section) => section.items.length > 0)
  const quick = QUICK.filter(allowed).slice(0, 4)

  const nav = (
    <nav className="space-y-5 px-3 pb-6">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="px-3 pb-1 text-xs font-semibold tracking-wide text-pew-200">{section.title}</p>
          <div className="space-y-0.5">
            {section.items.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive ? 'bg-pew-600 text-white' : 'text-pew-100 hover:bg-pew-700'
                  )
                }
              >
                <Icon className="size-4 shrink-0" />
                {label}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  )

  return (
    <div className="min-h-screen lg:flex">
      <aside className="no-print hidden w-64 shrink-0 flex-col overflow-y-auto bg-pew-900 lg:flex">
        <div className="px-5 py-5">{brand}</div>
        {nav}
        <div className="mt-auto border-t border-pew-700 px-5 py-4">
          <div className="flex items-center gap-2">
            {profile?.photo_url
              ? <img src={profile.photo_url} alt="" className="size-8 rounded-full object-cover" />
              : <span className="grid size-8 place-items-center rounded-full bg-pew-600 text-xs font-semibold text-white">
                  {(profile?.full_name || user?.email || '?').charAt(0).toUpperCase()}
                </span>}
            <div className="min-w-0">
              <p className="truncate text-sm text-white">{profile?.full_name || user?.email}</p>
              <p className="truncate text-xs text-brass-300">
                {profile?.role ?? 'No role'}{profile?.group_name ? ` · ${profile.group_name}` : ''}
              </p>
            </div>
          </div>
          <button onClick={signOut} className="mt-3 flex items-center gap-2 text-sm text-white hover:text-brass-300">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile header + slide-over menu */}
      <header className="no-print sticky top-0 z-40 flex items-center justify-between bg-pew-900 px-4 py-3 lg:hidden">
        {brand}
        <button onClick={() => setMenuOpen(true)} className="rounded-md p-2 text-white hover:bg-pew-700" aria-label="Open menu">
          <Menu className="size-6" />
        </button>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-50 bg-ink/50 lg:hidden" onClick={() => setMenuOpen(false)}>
          <div className="h-full w-72 overflow-y-auto bg-pew-900 pt-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pb-4">
              {brand}
              <button onClick={() => setMenuOpen(false)} className="rounded-md p-1 text-white" aria-label="Close menu">
                <X className="size-5" />
              </button>
            </div>
            {nav}
            <button onClick={signOut} className="mx-5 mb-8 flex items-center gap-2 text-sm text-white">
              <LogOut className="size-4" /> Sign out
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 px-4 pt-6 pb-28 sm:px-8 lg:pb-10">
        <div className="mx-auto max-w-6xl">
          {needsUpgrade && (
            <div className="no-print mb-6 rounded-lg border border-brass-300 bg-brass-100/60 px-4 py-3 text-sm">
              <strong>Your database is a version behind.</strong> Roles, billing, balances and automatic messages
              need the latest <code className="rounded bg-white/70 px-1">supabase/schema.sql</code> run in your
              Supabase SQL editor. Until then everyone keeps full access and the new pages will be empty.
            </div>
          )}
          <div key={location.pathname}>
            <Outlet />
          </div>
        </div>
      </main>

      <nav className="no-print fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        {quick.map(({ to, label, icon: Icon, end }) => (
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
