import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarCheck, Users, TrendingUp, PhoneCall, HandCoins, Receipt, MessageSquare, Plus, Cake, Wallet,
} from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { supabase, fetchAll } from '../lib/supabase'
import { useSettings } from '../context/SettingsContext'
import { BREAKDOWN_OPTIONS, CHART_COLORS } from '../lib/constants'
import { formatDate, initials, monthKey, monthLabel, pct, toISODate } from '../lib/utils'
import { Badge, Button, Empty, ErrorNote, PageHeader, Panel, Select, Spinner, Tabs } from '../components/ui'

const axisProps = { tick: { fontSize: 12, fill: '#64748b' }, tickLine: false, axisLine: false }
const tooltipStyle = { borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }
const dayKey = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export default function Dashboard() {
  const { settings, groups, money, can, profile } = useSettings()
  const [members, setMembers] = useState([])
  const [services, setServices] = useState([])
  const [attendance, setAttendance] = useState([])
  const [contributions, setContributions] = useState([])
  const [expenses, setExpenses] = useState([])
  const [balances, setBalances] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [breakdown, setBreakdown] = useState('group_name')
  const [tab, setTab] = useState('overview')

  const seesFinance = can('finance.view')

  useEffect(() => {
    async function load() {
      try {
        const since = toISODate(new Date(Date.now() - 180 * 24 * 3600 * 1000))
        const [mem, svc] = await Promise.all([
          fetchAll(() => supabase.from('members').select('*').order('full_name').order('id')),
          supabase.from('services').select('*').gte('service_date', since).order('service_date', { ascending: false }),
        ])
        setMembers(mem)
        setServices(svc.data ?? [])

        const ids = (svc.data ?? []).map((s) => s.id)
        if (ids.length) {
          setAttendance(await fetchAll(() => supabase.from('attendance').select('service_id, member_id').in('service_id', ids).order('id')))
        }

        if (seesFinance) {
          const [con, exp, bal] = await Promise.all([
            fetchAll(() => supabase.from('contributions').select('amount, contribution_date').gte('contribution_date', since).order('id')),
            fetchAll(() => supabase.from('expenses').select('amount, expense_date').gte('expense_date', since).order('id')),
            fetchAll(() => supabase.from('v_member_balances').select('*').eq('is_billable', true).order('member_id')),
          ])
          setContributions(con)
          setExpenses(exp)
          setBalances(bal)
        }
      } catch (e) { setError(e) }
      setLoading(false)
    }
    load()
  }, [seesFinance])

  const activeMembers = useMemo(() => members.filter((m) => m.is_active), [members])
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
    return [...map.values()].sort((a, b) => a.key.localeCompare(b.key))
      .map((m) => ({ ...m, average: Math.round(m.attendances / m.services) }))
  }, [closedServices, presentBy])

  const groupName = (id) => groups.find((g) => g.id === id)?.name ?? 'No group'

  const breakdownData = useMemo(() => {
    if (!latest) return []
    const present = presentBy.get(latest.id) ?? new Set()
    const map = new Map()
    for (const m of activeMembers) {
      if (!present.has(m.id)) continue
      const keys =
        breakdown === 'group_name' ? [groupName(m.group_id)]
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
    return activeMembers.filter((m) => recent.every((s) => m.joined_on <= s.service_date && !presentBy.get(s.id)?.has(m.id)))
  }, [closedServices, activeMembers, presentBy, settings])

  const birthdays = useMemo(() => {
    const keys = new Map()
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.now() + i * 86400000)
      keys.set(dayKey(d), i)
    }
    return activeMembers
      .filter((m) => m.date_of_birth && keys.has(dayKey(new Date(m.date_of_birth))))
      .map((m) => ({ ...m, inDays: keys.get(dayKey(new Date(m.date_of_birth))) }))
      .sort((a, b) => a.inDays - b.inDays)
  }, [activeMembers])

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
    const owing = balances.filter((b) => Number(b.balance) > 0)
    return {
      income, spent,
      monthly: [...map.values()].sort((a, b) => a.key.localeCompare(b.key)),
      outstanding: owing.reduce((n, b) => n + Number(b.balance), 0),
      defaulters: new Set(owing.map((b) => b.member_id)).size,
      topDebtors: owing.sort((a, b) => Number(b.balance) - Number(a.balance)).slice(0, 6),
    }
  }, [contributions, expenses, balances])

  if (loading) return <Spinner label="Loading your dashboard…" />

  const greeting = profile?.full_name ? `Welcome back, ${profile.full_name.split(' ')[0]}` : `Welcome to ${settings?.church_name ?? 'your church'}`

  return (
    <>
      <PageHeader
        title={greeting}
        subtitle={
          profile?.role && profile.role !== 'Administrator'
            ? `${profile.role}${profile.group_name ? ` · ${profile.group_name}` : ''}${profile.ministry ? ` · ${profile.ministry}` : ''}`
            : latest
              ? `Latest service: ${latest.title}, ${formatDate(latest.service_date, { day: 'numeric', month: 'long' })}`
              : 'Create your first service to get started.'
        }
        actions={
          <>
            {can('finance.record') && <Link to="/contributions"><Button variant="outline"><HandCoins className="size-4" /> Record payment</Button></Link>}
            {can('attendance.manage') && <Link to="/services"><Button><Plus className="size-4" /> New service</Button></Link>}
          </>
        }
      />
      <ErrorNote error={error} />

      <div className="mb-4">
        <Tabs value={tab} onChange={setTab} options={[
          { key: 'overview', label: 'Overview' },
          { key: 'membership', label: 'Membership analytics' },
        ]} />
      </div>

      {tab === 'overview' ? (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi icon={Users} label="Active members" value={activeMembers.length} hint={`${groups.length} groups`} />
            <Kpi icon={CalendarCheck} label="Latest attendance" value={latestPresent}
              hint={latestExpected ? `${pct(latestPresent, latestExpected)}% of ${latestExpected} expected` : 'No service yet'} />
            <Kpi icon={TrendingUp} label="Average attendance" value={`${averageRate}%`} hint="Last 8 closed services" />
            <Kpi icon={PhoneCall} label="Need a follow-up call" value={followUp.length}
              hint={`Missed the last ${settings?.follow_up_threshold ?? 3} services`} tone={followUp.length ? 'text-absent' : undefined} />
          </div>

          {seesFinance && (
            <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
              <Link to="/billing" className="rounded-xl border border-slate-200 bg-white px-5 py-4 hover:border-pew-300">
                <div className="flex items-center gap-2 text-slate-500">
                  <Wallet className="size-4" /><p className="text-sm">Outstanding balances</p>
                </div>
                <p className="mt-1 font-display text-3xl text-absent">{money(finance.outstanding)}</p>
                <p className="mt-0.5 text-xs text-slate-500">{finance.defaulters} members owing</p>
              </Link>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-3">
            <Panel title="Attendance by month" className="lg:col-span-2">
              {trend.length ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trend} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                      <CartesianGrid stroke="#eef2f6" vertical={false} />
                      <XAxis dataKey="label" {...axisProps} />
                      <YAxis {...axisProps} allowDecimals={false} />
                      <Tooltip contentStyle={tooltipStyle}
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
            {seesFinance && (
              <Panel title="Income and expenditure" className="lg:col-span-2"
                action={<Link to="/finance-reports" className="text-sm font-medium text-pew-600 hover:underline">Full reports</Link>}>
                {finance.monthly.length ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={finance.monthly} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                        <CartesianGrid stroke="#eef2f6" vertical={false} />
                        <XAxis dataKey="label" {...axisProps} />
                        <YAxis {...axisProps} />
                        <Tooltip formatter={(v) => money(v)} contentStyle={tooltipStyle} />
                        <Legend wrapperStyle={{ fontSize: 13 }} />
                        <Bar dataKey="Income" fill="#2f5d50" radius={[4, 4, 0, 0]} maxBarSize={32} />
                        <Bar dataKey="Expenditure" fill="#c8962e" radius={[4, 4, 0, 0]} maxBarSize={32} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <Empty title="No money recorded yet">
                    <Link to="/contributions" className="font-medium text-pew-600 underline">Record a contribution</Link> to see it here.
                  </Empty>
                )}
              </Panel>
            )}

            <Panel title="Follow-up list" className={seesFinance ? '' : 'lg:col-span-2'}
              action={followUp.length > 0 && can('sms.send') && (
                <Link to="/sms?audience=followup"><Button size="sm" variant="outline"><MessageSquare className="size-4" /> SMS them</Button></Link>
              )}>
              {followUp.length === 0 ? (
                <Empty title="Nobody is missing">Everyone has been at one of the recent services.</Empty>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {followUp.slice(0, 10).map((m) => (
                    <li key={m.id} className="flex items-center gap-2 py-2.5">
                      <Avatar member={m} />
                      <div className="min-w-0 flex-1">
                        <Link to={`/members/${m.id}`} className="block truncate font-medium hover:text-pew-600 hover:underline">{m.full_name}</Link>
                        <p className="truncate text-xs text-slate-500">{groupName(m.group_id)}</p>
                      </div>
                      {m.phone && <a href={`tel:${m.phone}`} className="rounded-md p-1.5 text-pew-600 hover:bg-pew-50" aria-label={`Call ${m.full_name}`}><PhoneCall className="size-4" /></a>}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Panel title="Birthdays this week"
              action={birthdays.length > 0 && <Link to="/birthdays" className="text-sm font-medium text-pew-600 hover:underline">Open</Link>}>
              {birthdays.length === 0 ? <Empty title="None in the next seven days" /> : (
                <ul className="divide-y divide-slate-100">
                  {birthdays.slice(0, 6).map((m) => (
                    <li key={m.id} className="flex items-center gap-2 py-2.5">
                      <Avatar member={m} />
                      <div className="min-w-0 flex-1">
                        <Link to={`/members/${m.id}`} className="block truncate font-medium hover:text-pew-600 hover:underline">{m.full_name}</Link>
                        <p className="text-xs text-slate-500">{formatDate(m.date_of_birth, { day: 'numeric', month: 'long' })}</p>
                      </div>
                      {m.inDays === 0 ? <Badge tone="brass">Today</Badge> : <span className="text-xs text-slate-500">in {m.inDays}d</span>}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            {seesFinance && (
              <Panel title="Largest balances owing"
                action={<Link to="/billing" className="text-sm font-medium text-pew-600 hover:underline">All balances</Link>}>
                {finance.topDebtors.length === 0 ? <Empty title="Nobody owes anything" /> : (
                  <ul className="divide-y divide-slate-100 text-sm">
                    {finance.topDebtors.map((b) => (
                      <li key={`${b.member_id}-${b.contribution_type_id}`} className="flex items-center justify-between py-2.5">
                        <div className="min-w-0">
                          <Link to={`/members/${b.member_id}`} className="block truncate font-medium hover:text-pew-600 hover:underline">{b.full_name}</Link>
                          <p className="text-xs text-slate-500">{b.contribution_type}{b.group_name ? ` · ${b.group_name}` : ''}</p>
                        </div>
                        <span className="font-semibold tabular-nums text-absent">{money(b.balance)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            )}

            <Panel title="Quick actions" className={seesFinance ? '' : 'lg:col-span-2'}>
              <div className="grid gap-2">
                {can('finance.record') && <QuickLink to="/contributions" icon={HandCoins} label="Record tithes and welfare" />}
                {can('finance.record') && <QuickLink to="/billing" icon={Wallet} label="Bill welfare or a special contribution" />}
                {can('finance.record') && <QuickLink to="/expenses" icon={Receipt} label="Record an expense" />}
                {can('sms.send') && <QuickLink to="/sms" icon={MessageSquare} label="Send a bulk SMS" />}
                <QuickLink to="/birthdays" icon={Cake} label="See this month’s birthdays" />
              </div>
            </Panel>
          </div>
        </>
      ) : (
        <MembershipAnalytics members={members} activeMembers={activeMembers} groupName={groupName} groups={groups} />
      )}
    </>
  )
}

function MembershipAnalytics({ members, activeMembers, groupName, groups }) {
  const count = (getKeys) => {
    const map = new Map()
    for (const m of activeMembers) {
      for (const k of getKeys(m)) map.set(k, (map.get(k) ?? 0) + 1)
    }
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }

  const gender = count((m) => [m.gender || 'Not stated'])
  const byGroup = count((m) => [groupName(m.group_id)]).sort((a, b) => a.name.localeCompare(b.name))
  const ministry = count((m) => (m.ministries?.length ? m.ministries : ['No ministry']))
  const status = count((m) => [m.member_type || 'Not set'])
  const ageGroup = count((m) => [m.age_group || 'Not set'])
  const marital = count((m) => [m.marital_status || 'Not stated'])

  const growth = useMemo(() => {
    const map = new Map()
    for (const m of members) {
      const year = String(m.joined_on ?? '').slice(0, 4)
      if (!year) continue
      map.set(year, (map.get(year) ?? 0) + 1)
    }
    const years = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    let running = 0
    return years.map(([year, joined]) => {
      running += joined
      return { year, joined, total: running }
    })
  }, [members])

  const contactable = activeMembers.filter((m) => m.phone).length
  const withDob = activeMembers.filter((m) => m.date_of_birth).length
  const withGroup = activeMembers.filter((m) => m.group_id).length
  const withPhoto = activeMembers.filter((m) => m.photo_url).length

  const completeness = [
    { name: 'Phone number', value: pct(contactable, activeMembers.length) },
    { name: 'Date of birth', value: pct(withDob, activeMembers.length) },
    { name: 'Group', value: pct(withGroup, activeMembers.length) },
    { name: 'Photo', value: pct(withPhoto, activeMembers.length) },
    { name: 'Ministry', value: pct(activeMembers.filter((m) => m.ministries?.length).length, activeMembers.length) },
  ]

  return (
    <div className="space-y-6">
      <div className="grid gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-4">
        <Stat label="Active members" value={activeMembers.length} />
        <Stat label="Inactive" value={members.length - activeMembers.length} />
        <Stat label="Reachable by SMS" value={`${pct(contactable, activeMembers.length)}%`} />
        <Stat label="Groups" value={groups.length} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Gender">
          <Donut data={gender} />
        </Panel>

        <Panel title="Members per group">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byGroup} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="#eef2f6" vertical={false} />
                <XAxis dataKey="name" {...axisProps} />
                <YAxis {...axisProps} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [v, 'Members']} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={48}>
                  {byGroup.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Ministry involvement" action={<span className="text-xs text-slate-500">Members can serve in more than one</span>}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ministry} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid stroke="#eef2f6" horizontal={false} />
                <XAxis type="number" {...axisProps} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={130} {...axisProps} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [v, 'Members']} />
                <Bar dataKey="value" fill="#2f5d50" radius={[0, 4, 4, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Membership status">
          <Donut data={status} />
        </Panel>

        <Panel title="Age groups">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ageGroup} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="#eef2f6" vertical={false} />
                <XAxis dataKey="name" {...axisProps} />
                <YAxis {...axisProps} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [v, 'Members']} />
                <Bar dataKey="value" fill="#c8962e" radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Marital status">
          <Donut data={marital} />
        </Panel>

        <Panel title="How the church has grown">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={growth} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="#eef2f6" vertical={false} />
                <XAxis dataKey="year" {...axisProps} />
                <YAxis {...axisProps} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle}
                  formatter={(v, n) => [v, n === 'total' ? 'Members in total' : 'Joined that year']} />
                <Legend wrapperStyle={{ fontSize: 13 }} />
                <Line type="monotone" dataKey="total" stroke="#2f5d50" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="joined" stroke="#c8962e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="How complete your records are" action={<span className="text-xs text-slate-500">Percentage filled in</span>}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={completeness} outerRadius={90}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                <Radar dataKey="value" stroke="#2f5d50" fill="#2f5d50" fillOpacity={0.35} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}%`, 'Filled in']} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
    </div>
  )
}

function Donut({ data }) {
  if (!data.length) return <Empty title="Nothing to show yet" />
  const total = data.reduce((n, d) => n + d.value, 0)
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="h-56 min-w-52 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={46} outerRadius={80} paddingAngle={2}>
              {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v, n) => [`${v} (${pct(v, total)}%)`, n]} contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="space-y-1.5 text-sm">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="size-2.5 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
            <span className="flex-1">{d.name}</span>
            <span className="font-semibold tabular-nums">{d.value}</span>
            <span className="w-10 text-right text-slate-500">{pct(d.value, total)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Avatar({ member }) {
  return member.photo_url
    ? <img src={member.photo_url} alt="" className="size-9 shrink-0 rounded-full object-cover" />
    : <span className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{initials(member.full_name)}</span>
}

function Stat({ label, value }) {
  return (
    <div className="bg-white px-5 py-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 font-display text-3xl">{value}</p>
    </div>
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
    <Link to={to} className="flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 text-sm font-medium hover:border-pew-300 hover:bg-pew-50">
      <Icon className="size-5 text-pew-600" />
      {label}
    </Link>
  )
}
