import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ArrowDownRight, ArrowUpRight, Phone, QrCode } from 'lucide-react'
import { supabase, fetchAll } from '../lib/supabase'
import { CATEGORY_OPTIONS, CHART_COLORS, SERVICE_TYPES } from '../lib/constants'
import { cn, formatDate, monthKey, monthLabel, parseDate, pct, toISODate } from '../lib/utils'
import { Button, ErrorNote, PageHeader, Panel, Spinner, inputClass } from '../components/ui'

const RANGES = [
  { months: 3, label: 'Last 3 months' },
  { months: 6, label: 'Last 6 months' },
  { months: 12, label: 'Last 12 months' },
]

const axisProps = { tick: { fontSize: 12, fill: '#64748b' }, tickLine: false, axisLine: false }
const tooltipStyle = { borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }

function categoryValue(member, key) {
  if (key === 'department') return member.department || 'Unassigned'
  return member[key] || 'Not set'
}

export default function Dashboard() {
  const [months, setMonths] = useState(6)
  const [serviceType, setServiceType] = useState('')
  const [categoryKey, setCategoryKey] = useState('age_group')
  const [raw, setRaw] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const now = new Date()
      const start = toISODate(new Date(now.getFullYear(), now.getMonth() - (months - 1), 1))
      const end = toISODate(now)
      try {
        const [services, attendance, members] = await Promise.all([
          fetchAll(() =>
            supabase.from('services').select('*').gte('service_date', start).lte('service_date', end).order('service_date').order('id')
          ),
          fetchAll(() =>
            supabase
              .from('attendance')
              .select('service_id, member_id, services!inner(service_date)')
              .gte('services.service_date', start)
              .lte('services.service_date', end)
              .order('id')
          ),
          fetchAll(() => supabase.from('members').select('*').order('id')),
        ])
        if (!cancelled) setRaw({ services, attendance, members, start, end })
      } catch (e) {
        if (!cancelled) setError(e)
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [months])

  const stats = useMemo(() => (raw ? computeStats(raw, serviceType, categoryKey) : null), [raw, serviceType, categoryKey])
  const category = CATEGORY_OPTIONS.find((c) => c.key === categoryKey)

  return (
    <>
      <PageHeader
        title="Attendance trends"
        subtitle="How attendance is moving, who is coming, and who needs a call."
        actions={
          <Link to="/services">
            <Button>
              <QrCode className="size-4" /> Start check-in
            </Button>
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <select className={`${inputClass} w-auto`} value={months} onChange={(e) => setMonths(Number(e.target.value))} aria-label="Date range">
          {RANGES.map((r) => (
            <option key={r.months} value={r.months}>{r.label}</option>
          ))}
        </select>
        <select className={`${inputClass} w-auto`} value={serviceType} onChange={(e) => setServiceType(e.target.value)} aria-label="Service type">
          <option value="">All service types</option>
          {SERVICE_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>

      <ErrorNote error={error} />

      {loading || !stats ? (
        <Spinner label="Crunching attendance…" />
      ) : stats.serviceCount === 0 ? (
        <Panel>
          <div className="py-10 text-center">
            <p className="font-display text-xl">No services in this range</p>
            <p className="mt-1 text-slate-600">Create a service and let members check in. Trends appear here after the first service.</p>
          </div>
        </Panel>
      ) : (
        <div className="space-y-6">
          {/* Headline */}
          <section className="grid gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Average per service" value={stats.avgAttendance} note={`across ${stats.serviceCount} services`} />
            <Kpi label="Attendance rate" value={`${stats.avgRate}%`} note="of active members expected" />
            <Kpi
              label="This month vs last"
              value={stats.monthDelta == null ? '—' : `${stats.monthDelta > 0 ? '+' : ''}${stats.monthDelta}%`}
              note="change in average attendance"
              trend={stats.monthDelta}
            />
            <Kpi label="Active members" value={stats.activeMembers} note={`${stats.newMembers} joined in this period`} />
          </section>

          {stats.insights.length > 0 && (
            <section className="rounded-xl border border-brass-300 bg-brass-100/60 px-5 py-4">
              <h2 className="font-display text-lg text-brass-700">What stands out</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">
                {stats.insights.map((t) => <li key={t}>{t}</li>)}
              </ul>
            </section>
          )}

          {/* Monthly trend */}
          <Panel title="Monthly trend">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={stats.monthly} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="#eef2f6" vertical={false} />
                  <XAxis dataKey="label" {...axisProps} />
                  <YAxis yAxisId="count" {...axisProps} allowDecimals={false} />
                  <YAxis yAxisId="rate" orientation="right" {...axisProps} domain={[0, 100]} unit="%" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 13 }} />
                  <Bar yAxisId="count" dataKey="avgAttendance" name="Avg attendance" fill="#2f5d50" radius={[4, 4, 0, 0]} maxBarSize={44} />
                  <Line yAxisId="rate" dataKey="rate" name="Attendance rate (%)" stroke="#c8962e" strokeWidth={2.5} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          {/* Category breakdown */}
          <Panel
            title="Who is attending"
            action={
              <div className="inline-flex flex-wrap rounded-lg bg-slate-100 p-1">
                {CATEGORY_OPTIONS.map((c) => (
                  <button
                    key={c.key}
                    onClick={() => setCategoryKey(c.key)}
                    className={cn(
                      'rounded-md px-3 py-1 text-sm font-semibold',
                      categoryKey === c.key ? 'bg-white text-ink shadow-sm' : 'text-slate-600'
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            }
          >
            <div className="grid gap-6 lg:grid-cols-5">
              <div className="h-80 lg:col-span-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.categoryMonthly} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid stroke="#eef2f6" vertical={false} />
                    <XAxis dataKey="label" {...axisProps} />
                    <YAxis {...axisProps} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {stats.categoryValues.map((v, i) => (
                      <Bar key={v} dataKey={v} stackId="a" fill={CHART_COLORS[i % CHART_COLORS.length]} maxBarSize={44} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
                <p className="mt-1 text-xs text-slate-500">Average attendance per service, by {category.label.toLowerCase()}</p>
              </div>
              <div className="lg:col-span-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="pb-2 font-medium">{category.label}</th>
                      <th className="pb-2 text-right font-medium">Avg</th>
                      <th className="pb-2 text-right font-medium">Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stats.categoryTable.map((r, i) => (
                      <tr key={r.name}>
                        <td className="py-2">
                          <span className="mr-2 inline-block size-2.5 rounded-sm" style={{ background: CHART_COLORS[stats.categoryValues.indexOf(r.name) % CHART_COLORS.length] || CHART_COLORS[i] }} />
                          {r.name}
                        </td>
                        <td className="py-2 text-right tabular-nums">{r.avg}</td>
                        <td className="py-2 text-right">
                          <span className={cn('tabular-nums font-semibold', r.rate < 50 ? 'text-absent' : r.rate >= 75 ? 'text-pew-600' : 'text-ink')}>
                            {r.expected ? `${r.rate}%` : '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Service by service">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats.perService} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid stroke="#eef2f6" vertical={false} />
                    <XAxis dataKey="short" {...axisProps} minTickGap={24} />
                    <YAxis {...axisProps} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} labelFormatter={(_, p) => p?.[0]?.payload?.full ?? ''} />
                    <Line dataKey="present" name="Present" stroke="#2f5d50" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="By service type">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.byType} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                    <CartesianGrid stroke="#eef2f6" horizontal={false} />
                    <XAxis type="number" {...axisProps} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" {...axisProps} width={120} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="avg" name="Avg attendance" fill="#c8962e" radius={[0, 4, 4, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>

          {/* Follow-up */}
          <Panel
            title="Needs a follow-up call"
            action={<span className="text-sm text-slate-500">Missed 3 or more services in a row</span>}
          >
            {stats.followUp.length === 0 ? (
              <p className="py-4 text-center text-slate-600">No one has missed three services in a row.</p>
            ) : (
              <ul className="grid gap-x-8 sm:grid-cols-2">
                {stats.followUp.slice(0, 20).map((m) => (
                  <li key={m.id} className="flex items-center gap-3 border-b border-slate-100 py-2.5">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-absent/10 font-display text-absent">{m.streak}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{m.full_name}</p>
                      <p className="truncate text-xs text-slate-500">
                        {m.lastSeen ? `Last seen ${formatDate(m.lastSeen, { day: 'numeric', month: 'short' })}` : 'Not seen in this period'}
                        {m.department ? `, ${m.department}` : ''}
                      </p>
                    </div>
                    {m.phone && (
                      <a href={`tel:${m.phone}`} className="rounded-md p-2 text-pew-600 hover:bg-pew-50" aria-label={`Call ${m.full_name}`}>
                        <Phone className="size-4" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {stats.followUp.length > 20 && (
              <p className="mt-3 text-sm text-slate-500">Showing 20 of {stats.followUp.length}. Use service reports for the full absent lists.</p>
            )}
          </Panel>
        </div>
      )}
    </>
  )
}

function Kpi({ label, value, note, trend }) {
  return (
    <div className="bg-white px-5 py-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 flex items-center gap-1 font-display text-3xl">
        {value}
        {trend > 0 && <ArrowUpRight className="size-5 text-pew-600" />}
        {trend < 0 && <ArrowDownRight className="size-5 text-absent" />}
      </p>
      <p className="mt-0.5 text-xs text-slate-500">{note}</p>
    </div>
  )
}

// ---------------------------------------------------------------------
// All analytics are computed in the browser from three queries.
// Comfortable for a few thousand members and a year of services.
// ---------------------------------------------------------------------
function computeStats(raw, serviceType, categoryKey) {
  const { members, attendance } = raw
  const services = raw.services.filter((s) => !serviceType || s.service_type === serviceType)
  const memberById = new Map(members.map((m) => [m.id, m]))
  const active = members.filter((m) => m.is_active)
  const category = CATEGORY_OPTIONS.find((c) => c.key === categoryKey)

  const presentBySvc = new Map()
  for (const a of attendance) {
    if (!presentBySvc.has(a.service_id)) presentBySvc.set(a.service_id, new Set())
    presentBySvc.get(a.service_id).add(a.member_id)
  }

  // Per-service facts
  const perServiceFacts = services.map((s) => {
    const present = presentBySvc.get(s.id) ?? new Set()
    const eligible = active.filter((m) => m.joined_on <= s.service_date)
    const presentByCat = {}
    const expectedByCat = {}
    for (const id of present) {
      const m = memberById.get(id)
      if (!m) continue
      const v = categoryValue(m, categoryKey)
      presentByCat[v] = (presentByCat[v] ?? 0) + 1
    }
    let presentEligible = 0
    for (const m of eligible) {
      const v = categoryValue(m, categoryKey)
      expectedByCat[v] = (expectedByCat[v] ?? 0) + 1
      if (present.has(m.id)) presentEligible++
    }
    return { s, present, eligible: eligible.length, presentEligible, presentByCat, expectedByCat }
  })

  // Monthly
  const monthKeys = []
  const startD = parseDate(raw.start)
  const endD = parseDate(raw.end)
  for (let d = new Date(startD.getFullYear(), startD.getMonth(), 1); d <= endD; d.setMonth(d.getMonth() + 1)) {
    monthKeys.push(toISODate(d).slice(0, 7))
  }
  const byMonth = new Map(monthKeys.map((k) => [k, []]))
  for (const f of perServiceFacts) byMonth.get(monthKey(f.s.service_date))?.push(f)

  const monthly = monthKeys.map((k) => {
    const list = byMonth.get(k)
    const total = list.reduce((n, f) => n + f.present.size, 0)
    const pe = list.reduce((n, f) => n + f.presentEligible, 0)
    const el = list.reduce((n, f) => n + f.eligible, 0)
    return {
      key: k,
      label: monthLabel(k),
      services: list.length,
      avgAttendance: list.length ? Math.round(total / list.length) : 0,
      rate: el ? pct(pe, el) : null,
    }
  })

  // Category values present in the data, in configured order first
  const seen = new Set()
  for (const f of perServiceFacts) {
    Object.keys(f.presentByCat).forEach((v) => seen.add(v))
    Object.keys(f.expectedByCat).forEach((v) => seen.add(v))
  }
  const categoryValues = [...category.values.filter((v) => seen.has(v)), ...[...seen].filter((v) => !category.values.includes(v))]

  const categoryMonthly = monthKeys.map((k) => {
    const list = byMonth.get(k)
    const row = { label: monthLabel(k) }
    for (const v of categoryValues) {
      const sum = list.reduce((n, f) => n + (f.presentByCat[v] ?? 0), 0)
      row[v] = list.length ? Math.round((sum / list.length) * 10) / 10 : 0
    }
    return row
  })

  const categoryTable = categoryValues
    .map((v) => {
      const presentSum = perServiceFacts.reduce((n, f) => n + (f.presentByCat[v] ?? 0), 0)
      const expected = perServiceFacts.reduce((n, f) => n + (f.expectedByCat[v] ?? 0), 0)
      return {
        name: v,
        avg: Math.round((presentSum / perServiceFacts.length) * 10) / 10,
        expected,
        rate: expected ? Math.min(100, pct(presentSum, expected)) : 0,
      }
    })
    .sort((a, b) => b.avg - a.avg)

  // Per service line
  const perService = perServiceFacts.map((f) => ({
    short: formatDate(f.s.service_date, { day: 'numeric', month: 'short' }),
    full: `${f.s.title}, ${formatDate(f.s.service_date)}`,
    present: f.present.size,
  }))

  // By service type (ignores the type filter so types can be compared)
  const typeMap = new Map()
  for (const s of raw.services) {
    const t = typeMap.get(s.service_type) ?? { total: 0, count: 0 }
    t.total += presentBySvc.get(s.id)?.size ?? 0
    t.count += 1
    typeMap.set(s.service_type, t)
  }
  const byType = [...typeMap.entries()]
    .map(([name, t]) => ({ name, avg: Math.round(t.total / t.count) }))
    .sort((a, b) => b.avg - a.avg)

  // KPIs
  const totalPresent = perServiceFacts.reduce((n, f) => n + f.present.size, 0)
  const totalPE = perServiceFacts.reduce((n, f) => n + f.presentEligible, 0)
  const totalEl = perServiceFacts.reduce((n, f) => n + f.eligible, 0)
  const cur = monthly[monthly.length - 1]
  const prev = monthly[monthly.length - 2]
  const monthDelta = cur?.services && prev?.services && prev.avgAttendance ? pct(cur.avgAttendance - prev.avgAttendance, prev.avgAttendance) : null

  // Follow-up: consecutive misses, newest first, closed services only
  const closedDesc = perServiceFacts.filter((f) => !f.s.is_open).reverse()
  const followUp = active
    .map((m) => {
      let streak = 0
      let lastSeen = null
      for (const f of closedDesc) {
        if (f.s.service_date < m.joined_on) break
        if (f.present.has(m.id)) {
          lastSeen = f.s.service_date
          break
        }
        streak++
      }
      return { ...m, streak, lastSeen }
    })
    .filter((m) => m.streak >= 3)
    .sort((a, b) => b.streak - a.streak || a.full_name.localeCompare(b.full_name))

  // Plain-language insights
  const insights = []
  const rated = monthly.filter((m) => m.services && m.rate != null)
  if (rated.length >= 2) {
    const best = rated.reduce((a, b) => (b.rate > a.rate ? b : a))
    const worst = rated.reduce((a, b) => (b.rate < a.rate ? b : a))
    if (best.key !== worst.key) insights.push(`Strongest month was ${best.label} at ${best.rate}%; weakest was ${worst.label} at ${worst.rate}%.`)
  }
  if (monthDelta != null && Math.abs(monthDelta) >= 5) {
    insights.push(`Average attendance is ${monthDelta > 0 ? 'up' : 'down'} ${Math.abs(monthDelta)}% compared with last month.`)
  }
  const lowCat = categoryTable.filter((c) => c.expected >= 5).sort((a, b) => a.rate - b.rate)[0]
  if (lowCat && lowCat.rate < 60) {
    insights.push(`${lowCat.name} has the lowest attendance rate by ${category.label.toLowerCase()} (${lowCat.rate}%).`)
  }
  if (followUp.length) {
    insights.push(`${followUp.length} active ${followUp.length === 1 ? 'member has' : 'members have'} missed three or more services in a row.`)
  }

  return {
    serviceCount: services.length,
    avgAttendance: services.length ? Math.round(totalPresent / services.length) : 0,
    avgRate: pct(totalPE, totalEl),
    monthDelta,
    activeMembers: active.length,
    newMembers: active.filter((m) => m.joined_on >= raw.start).length,
    monthly,
    categoryValues,
    categoryMonthly,
    categoryTable,
    perService,
    byType,
    followUp,
    insights,
  }
}
