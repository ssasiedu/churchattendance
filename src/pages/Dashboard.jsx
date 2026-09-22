import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, Users, TrendingUp, PhoneCall, HandCoins, Receipt, MessageSquare, Plus } from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { supabase, fetchAll } from '../lib/supabase'
import { useSettings } from '../context/SettingsContext'
import { BREAKDOWN_OPTIONS, CHART_COLORS } from '../lib/constants'
import { formatDate, monthKey, monthLabel, pct, toISODate } from '../lib/utils'
import { Button, Empty, ErrorNote, PageHeader, Panel, Select, Spinner } from '../components/ui'

const axisProps = { tick: { fontSize: 12, fill: '#64748b' }, tickLine: false, axisLine: false }

export default function Dashboard() {
  const { settings, groups, money } = useSettings()
  const [members, setMembers] = useState([])
  const [services, setServices] = useState([])
  const [attendance, setAttendance] = useState([])
  const [contributions, setContributions] = useState([])
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [breakdown, setBreakdown] = useState('group_name')

  useEffect(() => {
    async function load() {
      try {
        const since = toISODate(new Date(Date.now() - 180 * 24 * 3600 * 1000))
        const [mem, svc, con, exp] = await Promise.all([
          fetchAll(() => supabase.from('members').select('*').order('full_name').order('id')),
          supabase.from('services').select('*').gte('service_date', since).order('service_date', { ascending: false }),
          fetchAll(() => supabase.from('contributions').select('amount, contribution_date').gte('contribution_date', since).order('id')),
          fetchAll(() => supabase.from('expenses').select('amount, expense_date').gte('expense_date', since).order('id')),
        ])
        setMembers(mem)
        setServices(svc.data ?? [])
        setContributions(con)
        setExpenses(exp)
        const ids = (svc.data ?? []).map((s) => s.id)
        if (ids.length) {
          setAttendance(await fetchAll(() => supabase.from('attendance').select('service_id, member_id').in('service_id', ids).order('id')))
        }
      } catch (e) { setError(e) }
      setLoading(false)
    }
    load()
  }, [])

  const activeMembers = members.filter((m) => m.is_active)
  const closedServices = useMemo(() => services.filter((s) => !s.is_open), [services])
  const latest = services[0]

  const presentBy = useMemo(() => {
    const map = new Map()
    for (const a of attendance) {
      if (!map.has(a.service_id)) map.set(a.service_id, new Set())
      map.get(a.service_id).add(a.member_id)
    }
    return map
  }, [attendance])

  const latestPresent = latest ? (presentBy.get(latest.id)?.size ?? 0) : 0
  const latestExpected = latest ? activeMembers.filter((m) => m.joined_on <= latest.service_date).length : 0

  const averageRate = useMemo(() => {
    const recent = closedServices.slice(0, 8)
    if (!recent.length) return 0
    const rates = recent.map((s) => {
      const expected = activeMembers.filter((m) => m.joined_on <= s.service_date).length
      return expected ? ((presentBy.get(s.id)?.size ?? 0) / expected) * 100 : 0
    })
    return Math.round(rates.reduce((a, b) => a + b, 0) / rates.length)
  }, [closedServices, activeMembers, presentBy])

  const trend = useMemo(() => {
    const map = new Map()
    for (const s of closedServices) {
      const k = monthKey(s.service_date)
      const cur = map.get(k) ?? { key: k, label: monthLabel(k), attendances: 0, services: 0 }
      cur.attendances += presentBy.get(s.id)?.size ?? 0
      cur.services += 1
      map.set(k, cur)
    }
    return [...map.values()]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((m) => ({ ...m, average: Math.round(m.attendances / m.services) }))
  }, [closedServices, presentBy])

  const breakdownData = useMemo(() => {
    if (!latest) return []
    const present = presentBy.get(latest.id) ?? new Set()
    const map = new Map()
    for (const m of activeMembers) {
      if (!present.has(m.id)) continue
      const keys =
        breakdown === 'group_name' ? [groups.find((g) => g.id === m.group_id)?.name ?? 'No group']
        : breakdown === 'ministry' ? (m.ministries?.length ? m.ministries : ['No ministry'])
        : [m[breakdown] || 'Not set']
      for (const k of keys) map.set(k, (map.get(k) ?? 0) + 1)
    }
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [latest, presentBy, activeMembers, breakdown, groups])

  const followUp = useMemo(() => {
    const threshold = settings?.follow_up_threshold ?? 3
    const recent = closedServices.slice(0, threshold)
    if (recent.length < threshold) return []
    return activeMembers
      .filter((m) => recent.every((s) => m.joined_on <= s.service_date && !presentBy.get(s.id)?.has(m.id)))
      .slice(0, 12)
  }, [closedServices, activeMembers, presentBy, settings])

  const finance = useMemo(() => {
    const start = toISODate(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
    const income = contributions.filter((c) => c.contribution_date >= start).reduce((n, c) => n + Number(c.amount), 0)
    const spent = expenses.filter((e) => e.expense_date >= start).reduce((n, e) => n + Number(e.amount), 0)
    const map = new Map()
    for (const c of contributions) {
      const k = monthKey(c.contribution_date)
      const cur = map.get(k) ?? { key: k, label: monthLabel(k), Income: 0, Expenditure: 0 }
      cur.Income += Number(c.amount)
      map.set(k, cur)
    }
    for (const e of expenses) {
      const k = monthKey(e.expense_date)
      const cur = map.get(k) ?? { key: k, label: monthLabel(k), Income: 0, Expenditure: 0 }
      cur.Expenditure += Number(e.amount)
      map.set(k, cur)
    }
    return { income, spent, monthly: [...map.values()].sort((a, b) => a.key.localeCompare(b.key)) }
  }, [contributions, expenses])

  if (loading) return <Spinner label="Loading your dashboard…" />

  return (
    <>
      <PageHeader
        title={`Welcome to ${settings?.church_name ?? 'your church'}`}
        subtitle={latest ? `Latest service: ${latest.title}, ${formatDate(latest.service_date, { day: 'numeric', month: 'long' })}` : 'Create your first service to get started.'}
        actions={
          <>
            <Link to="/contributions"><Button variant="outline"><HandCoins className="size-4" /> Record payment</Button></Link>
            <Link to="/services"><Button><Plus className="size-4" /> New service</Button></Link>
          </>
        }
      />
      <ErrorNote error={error} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={Users} label="Active members" value={activeMembers.length} hint={`${groups.length} groups`} />
        <Kpi icon={CalendarCheck} label="Latest attendance" value={latestPresent}
          hint={latestExpected ? `${pct(latestPresent, latestExpected)}% of ${latestExpected} expected` : 'No service yet'} />
        <Kpi icon={TrendingUp} label="Average attendance" value={`${averageRate}%`} hint="Last 8 closed services" />
        <Kpi icon={PhoneCall} label="Need a follow-up call" value={followUp.length}
          hint={`Missed the last ${settings?.follow_up_threshold ?? 3} services`} tone={followUp.length ? 'text-absent' : undefined} />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-pew-900 px-5 py-4 text-white">
          <p className="text-sm text-pew-200">Income this month</p>
          <p className="mt-1 font-display text-3xl">{money(finance.income)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
          <p className="text-sm text-slate-500">Spent this month</p>
          <p className="mt-1 font-display text-3xl text-absent">{money(finance.spent)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
          <p className="text-sm text-slate-500">{finance.income - finance.spent >= 0 ? 'Surplus' : 'Deficit'} this month</p>
          <p className="mt-1 font-display text-3xl">{money(Math.abs(finance.income - finance.spent))}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Attendance by month" className="lg:col-span-2">
          {trend.length ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="#eef2f6" vertical={false} />
                  <XAxis dataKey="label" {...axisProps} />
                  <YAxis {...axisProps} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
                    formatter={(v, n) => [v, n === 'average' ? 'Average per service' : 'Total check-ins']} />
                  <Line type="monotone" dataKey="average" stroke="#2f5d50" strokeWidth={2.5} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="attendances" stroke="#c8962e" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty title="No closed services yet">Close a service and its numbers appear here.</Empty>}
        </Panel>

        <Panel title="Who came last service"
          action={<Select allowEmpty={false} value={breakdown} onChange={(e) => setBreakdown(e.target.value)}
            options={BREAKDOWN_OPTIONS.map((b) => ({ value: b.key, label: b.label }))} />}>
          {breakdownData.length ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={breakdownData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={84} paddingAngle={2}>
                    {breakdownData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty title="Nobody checked in yet" />}
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel title="Income and expenditure" className="lg:col-span-2"
          action={<Link to="/finance-reports" className="text-sm font-medium text-pew-600 hover:underline">Full reports</Link>}>
          {finance.monthly.length ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={finance.monthly} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid stroke="#eef2f6" vertical={false} />
                  <XAxis dataKey="label" {...axisProps} />
                  <YAxis {...axisProps} />
                  <Tooltip formatter={(v) => money(v)} contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />
                  <Legend wrapperStyle={{ fontSize: 13 }} />
                  <Bar dataKey="Income" fill="#2f5d50" radius={[4, 4, 0, 0]} maxBarSize={32} />
                  <Bar dataKey="Expenditure" fill="#c8962e" radius={[4, 4, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty title="No money recorded yet">
              <Link to="/contributions" className="font-medium text-pew-600 underline">Record a contribution</Link> or{' '}
              <Link to="/expenses" className="font-medium text-pew-600 underline">an expense</Link> to see it here.
            </Empty>
          )}
        </Panel>

        <Panel title="Follow-up list"
          action={followUp.length > 0 && (
            <Link to="/sms?audience=followup"><Button size="sm" variant="outline"><MessageSquare className="size-4" /> SMS them</Button></Link>
          )}>
          {followUp.length === 0 ? (
            <Empty title="Nobody is missing">Everyone has been at one of the recent services.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {followUp.map((m) => (
                <li key={m.id} className="flex items-center gap-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <Link to={`/members/${m.id}`} className="block truncate font-medium hover:text-pew-600 hover:underline">{m.full_name}</Link>
                    <p className="truncate text-xs text-slate-500">{groups.find((g) => g.id === m.group_id)?.name ?? 'No group'}</p>
                  </div>
                  {m.phone && <a href={`tel:${m.phone}`} className="rounded-md p-1.5 text-pew-600 hover:bg-pew-50" aria-label={`Call ${m.full_name}`}><PhoneCall className="size-4" /></a>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <QuickLink to="/contributions" icon={HandCoins} label="Record tithes and welfare" />
        <QuickLink to="/expenses" icon={Receipt} label="Record an expense" />
        <QuickLink to="/sms" icon={MessageSquare} label="Send a bulk SMS" />
      </div>
    </>
  )
}

function Kpi({ icon: Icon, label, value, hint, tone }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
      <div className="flex items-center gap-2 text-slate-500">
        <Icon className="size-4" />
        <p className="text-sm">{label}</p>
      </div>
      <p className={`mt-1 font-display text-3xl ${tone ?? ''}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

function QuickLink({ to, icon: Icon, label }) {
  return (
    <Link to={to} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium hover:border-pew-300 hover:bg-pew-50">
      <Icon className="size-5 text-pew-600" />
      {label}
    </Link>
  )
}
