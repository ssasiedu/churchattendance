import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Download, Printer, Lock, Search, UserCheck, UserX } from 'lucide-react'
import { supabase, fetchAll } from '../lib/supabase'
import { CHURCH_NAME } from '../lib/constants'
import { cn, downloadCSV, formatDate, formatTime, matchesSearch, pct } from '../lib/utils'
import { Badge, Button, ErrorNote, PageHeader, Panel, Spinner, inputClass } from '../components/ui'

export default function Reports() {
  const { serviceId } = useParams()
  const navigate = useNavigate()
  const [services, setServices] = useState([])
  const [service, setService] = useState(null)
  const [members, setMembers] = useState([])
  const [attendance, setAttendance] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('present')
  const [query, setQuery] = useState('')

  // Service picker
  useEffect(() => {
    supabase
      .from('services')
      .select('id, title, service_type, service_date, is_open')
      .order('service_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (error) return setError(error)
        setServices(data)
        if (!serviceId && data.length) navigate(`/reports/${data[0].id}`, { replace: true })
        if (!data.length) setLoading(false)
      })
  }, [serviceId, navigate])

  const load = useCallback(async () => {
    if (!serviceId) return
    setLoading(true)
    setError(null)
    try {
      const [{ data: svc, error: e1 }, mem, att] = await Promise.all([
        supabase.from('services').select('*').eq('id', serviceId).single(),
        fetchAll(() => supabase.from('members').select('*').order('full_name').order('id')),
        fetchAll(() => supabase.from('attendance').select('*').eq('service_id', serviceId).order('id')),
      ])
      if (e1) throw e1
      setService(svc)
      setMembers(mem)
      setAttendance(att)
    } catch (e) {
      setError(e)
    }
    setLoading(false)
  }, [serviceId])

  useEffect(() => {
    load()
  }, [load])

  const { present, absent } = useMemo(() => {
    if (!service) return { present: [], absent: [] }
    const byMember = new Map(attendance.map((a) => [a.member_id, a]))
    const present = []
    const absent = []
    for (const m of members) {
      const a = byMember.get(m.id)
      if (a) present.push({ ...m, checked_in_at: a.checked_in_at, method: a.method, attendance_id: a.id })
      else if (m.is_active && m.joined_on <= service.service_date) absent.push(m)
    }
    present.sort((x, y) => x.full_name.localeCompare(y.full_name))
    return { present, absent }
  }, [service, members, attendance])

  const expected = present.length + absent.length
  const rows = (tab === 'present' ? present : absent).filter((m) => matchesSearch(m.full_name, query))

  const departments = useMemo(() => {
    const map = new Map()
    for (const m of present) bump(map, m.department || 'Unassigned', 'present')
    for (const m of absent) bump(map, m.department || 'Unassigned', 'absent')
    return [...map.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.present + b.absent - (a.present + a.absent))
  }, [present, absent])

  async function markPresent(m) {
    const { data, error } = await supabase
      .from('attendance')
      .insert({ service_id: serviceId, member_id: m.id, method: 'admin' })
      .select()
      .single()
    if (error) setError(error)
    else setAttendance((list) => [...list, data])
  }

  async function unmark(m) {
    const { error } = await supabase.from('attendance').delete().eq('id', m.attendance_id)
    if (error) setError(error)
    else setAttendance((list) => list.filter((a) => a.id !== m.attendance_id))
  }

  async function closeService() {
    const { error } = await supabase.from('services').update({ is_open: false }).eq('id', serviceId)
    if (error) setError(error)
    else setService((s) => ({ ...s, is_open: false }))
  }

  function exportCSV() {
    const all = [
      ...present.map((m) => ({ ...m, status: 'Present' })),
      ...absent.map((m) => ({ ...m, status: 'Absent' })),
    ]
    downloadCSV(`attendance-${service.service_date}-${service.title.replace(/\W+/g, '-').toLowerCase()}.csv`, all, [
      { label: 'Name', value: 'full_name' },
      { label: 'Status', value: 'status' },
      { label: 'Phone', value: 'phone' },
      { label: 'Department', value: 'department' },
      { label: 'Age group', value: 'age_group' },
      { label: 'Membership', value: 'member_type' },
      { label: 'Checked in at', value: (r) => (r.checked_in_at ? formatTime(r.checked_in_at) : '') },
      { label: 'Recorded by', value: (r) => (r.method === 'admin' ? 'Admin' : r.method ? 'Self' : '') },
    ])
  }

  if (!serviceId && !loading && !services.length) {
    return (
      <>
        <PageHeader title="Reports" />
        <Panel>
          <p className="py-8 text-center text-slate-600">Create a service first. Its report will appear here.</p>
        </Panel>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Service report"
        subtitle={service ? `${service.title}, ${formatDate(service.service_date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}` : ' '}
        actions={
          service && (
            <>
              {service.is_open && (
                <Button variant="brass" onClick={closeService}>
                  <Lock className="size-4" /> Close check-in
                </Button>
              )}
              <Button variant="outline" onClick={exportCSV}>
                <Download className="size-4" /> Export CSV
              </Button>
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="size-4" /> Print
              </Button>
            </>
          )
        }
      />

      <div className="no-print mb-6">
        <select className={`${inputClass} max-w-md`} value={serviceId ?? ''} onChange={(e) => navigate(`/reports/${e.target.value}`)} aria-label="Choose a service">
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {formatDate(s.service_date)} — {s.title}{s.is_open ? ' (open)' : ''}
            </option>
          ))}
        </select>
      </div>

      <ErrorNote error={error} />

      {loading || !service ? (
        <Spinner />
      ) : (
        <>
          <p className="mb-2 hidden font-display text-xl print:block">{CHURCH_NAME}</p>

          {/* Summary */}
          <div className="mb-6 grid grid-cols-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <Summary label="Present" value={present.length} tone="text-pew-600" />
            <Summary label="Absent" value={absent.length} tone="text-absent" border />
            <Summary label="Attendance rate" value={`${pct(present.length, expected)}%`} border />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div className="no-print mb-3 flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg bg-slate-100 p-1">
                  <TabButton active={tab === 'present'} onClick={() => setTab('present')}>
                    Present ({present.length})
                  </TabButton>
                  <TabButton active={tab === 'absent'} onClick={() => setTab('absent')}>
                    Absent ({absent.length})
                  </TabButton>
                </div>
                <div className="relative min-w-48 flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                  <input className={`${inputClass} pl-9`} placeholder="Find a name" value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
              </div>

              {/* Screen list */}
              <div className="no-print overflow-hidden rounded-xl border border-slate-200 bg-white">
                <ul className="divide-y divide-slate-100">
                  {rows.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{m.full_name}</p>
                        <p className="text-sm text-slate-500">
                          {[m.department, m.member_type, m.phone].filter(Boolean).join(', ')}
                        </p>
                      </div>
                      {tab === 'present' ? (
                        <>
                          <span className="text-sm text-slate-500">{formatTime(m.checked_in_at)}</span>
                          {m.method === 'admin' && <Badge tone="brass">Admin</Badge>}
                          <Button size="sm" variant="ghost" onClick={() => unmark(m)} title="Remove this check-in">
                            <UserX className="size-4 text-absent" />
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => markPresent(m)}>
                          <UserCheck className="size-4" /> Mark present
                        </Button>
                      )}
                    </li>
                  ))}
                  {rows.length === 0 && (
                    <li className="px-4 py-10 text-center text-slate-500">
                      {query ? 'No names match your search.' : tab === 'present' ? 'Nobody has checked in yet.' : 'Everyone expected was present.'}
                    </li>
                  )}
                </ul>
              </div>

              {/* Print version: both lists */}
              <div className="hidden print:block">
                <PrintList title={`Present (${present.length})`} rows={present} showTime />
                <PrintList title={`Absent (${absent.length})`} rows={absent} />
              </div>
            </div>

            <Panel title="By department" className="print-break h-fit">
              <ul className="space-y-3">
                {departments.map((d) => {
                  const rate = pct(d.present, d.present + d.absent)
                  return (
                    <li key={d.name}>
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{d.name}</span>
                        <span className="text-slate-500">
                          {d.present}/{d.present + d.absent}
                        </span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-pew-500" style={{ width: `${rate}%` }} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </Panel>
          </div>
        </>
      )}
    </>
  )
}

function bump(map, key, field) {
  const v = map.get(key) ?? { present: 0, absent: 0 }
  v[field] += 1
  map.set(key, v)
}

function Summary({ label, value, tone, border }) {
  return (
    <div className={cn('px-5 py-4', border && 'border-l border-slate-200')}>
      <p className="text-sm text-slate-500">{label}</p>
      <p className={cn('mt-1 font-display text-3xl', tone)}>{value}</p>
    </div>
  )
}

function TabButton({ active, children, onClick }) {
  return (
    <button
      onClick={onClick}
      className={cn('rounded-md px-3 py-1.5 text-sm font-semibold', active ? 'bg-white text-ink shadow-sm' : 'text-slate-600')}
    >
      {children}
    </button>
  )
}

function PrintList({ title, rows, showTime }) {
  return (
    <div className="mb-6">
      <h3 className="mb-2 font-display text-lg">{title}</h3>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-400 text-left">
            <th className="py-1">#</th>
            <th className="py-1">Name</th>
            <th className="py-1">Department</th>
            <th className="py-1">Phone</th>
            {showTime && <th className="py-1">Time</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((m, i) => (
            <tr key={m.id} className="border-b border-slate-200">
              <td className="py-1">{i + 1}</td>
              <td className="py-1">{m.full_name}</td>
              <td className="py-1">{m.department || ''}</td>
              <td className="py-1">{m.phone || ''}</td>
              {showTime && <td className="py-1">{formatTime(m.checked_in_at)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
