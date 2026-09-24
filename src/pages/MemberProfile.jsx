import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Phone, MessageSquare, Printer } from 'lucide-react'
import { supabase, fetchAll } from '../lib/supabase'
import { useSettings } from '../context/SettingsContext'
import { age } from '../lib/format'
import { formatDate, initials, pct } from '../lib/utils'
import { Badge, Button, Empty, ErrorNote, PageHeader, Panel, Spinner } from '../components/ui'

export default function MemberProfile() {
  const { memberId } = useParams()
  const navigate = useNavigate()
  const { settings, groupName, money } = useSettings()
  const [member, setMember] = useState(null)
  const [attendance, setAttendance] = useState([])
  const [services, setServices] = useState([])
  const [contributions, setContributions] = useState([])
  const [balances, setBalances] = useState([])
  const [bills, setBills] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const [{ data: m, error: e1 }, att, svc, con, bal, bl] = await Promise.all([
          supabase.from('members').select('*').eq('id', memberId).single(),
          fetchAll(() => supabase.from('attendance').select('service_id, checked_in_at').eq('member_id', memberId).order('id')),
          supabase.from('services').select('id, title, service_date, is_open').order('service_date', { ascending: false }).limit(40),
          fetchAll(() => supabase.from('v_member_contributions').select('*').eq('member_id', memberId).order('contribution_date', { ascending: false }).order('id')),
          supabase.from('v_member_balances').select('*').eq('member_id', memberId),
          supabase.from('v_bills').select('*').eq('member_id', memberId).order('bill_date', { ascending: false }).limit(60),
        ])
        if (e1) throw e1
        setMember(m)
        setAttendance(att)
        setServices(svc.data ?? [])
        setContributions(con)
        setBalances(bal.data ?? [])
        setBills(bl.data ?? [])
      } catch (e) { setError(e) }
      setLoading(false)
    }
    load()
  }, [memberId])

  const presentIds = useMemo(() => new Set(attendance.map((a) => a.service_id)), [attendance])
  const eligible = useMemo(
    () => services.filter((s) => !s.is_open && member && s.service_date >= member.joined_on),
    [services, member]
  )
  const attended = eligible.filter((s) => presentIds.has(s.id)).length

  const byType = useMemo(() => {
    const map = new Map()
    contributions.forEach((c) => map.set(c.contribution_type, (map.get(c.contribution_type) ?? 0) + Number(c.amount)))
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [contributions])
  const totalGiven = contributions.reduce((n, c) => n + Number(c.amount), 0)
  const owing = balances.filter((b) => Number(b.balance) > 0)
  const totalOwing = owing.reduce((n, b) => n + Number(b.balance), 0)

  if (loading) return <Spinner />
  if (error) return <ErrorNote error={error} />
  if (!member) return <Empty title="Member not found" />

  return (
    <>
      <button onClick={() => navigate('/members')} className="no-print mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-ink">
        <ArrowLeft className="size-4" /> All members
      </button>

      <PageHeader
        title={member.full_name}
        subtitle={[groupName(member.group_id) || 'No group', member.member_type, member.is_active ? null : 'Inactive'].filter(Boolean).join(' · ')}
        actions={
          <>
            {member.phone && <a href={`tel:${member.phone}`}><Button variant="outline"><Phone className="size-4" /> Call</Button></a>}
            <Link to="/sms"><Button variant="outline"><MessageSquare className="size-4" /> SMS</Button></Link>
            <Button variant="outline" onClick={() => window.print()}><Printer className="size-4" /> Print</Button>
          </>
        }
      />

      <div className="mb-6 hidden items-center gap-3 print:flex">
        {settings?.logo_url && <img src={settings.logo_url} alt="" className="h-12 object-contain" />}
        <p className="font-display text-xl">{settings?.church_name}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Details" className="lg:col-span-2">
          <div className="flex items-start gap-4">
            {member.photo_url ? (
              <img src={member.photo_url} alt="" className="size-20 shrink-0 rounded-full border border-slate-200 object-cover" />
            ) : (
              <span className="grid size-20 shrink-0 place-items-center rounded-full bg-pew-50 font-display text-2xl text-pew-600">
                {initials(member.full_name)}
              </span>
            )}
            <dl className="grid flex-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Detail label="Phone" value={member.phone} />
              <Detail label="Alternative phone" value={member.phone_alt} />
              <Detail label="Email" value={member.email} />
              <Detail label="Membership number" value={member.member_no} />
              <Detail label="Gender" value={member.gender} />
              <Detail label="Date of birth" value={member.date_of_birth ? `${formatDate(member.date_of_birth)} (${age(member.date_of_birth)})` : null} />
              <Detail label="Marital status" value={member.marital_status} />
              <Detail label="Age group" value={member.age_group} />
              <Detail label="Ministries" value={(member.ministries ?? []).join(', ')} />
              <Detail label="Department" value={member.department} />
              <Detail label="Joined the church" value={formatDate(member.joined_on)} />
              <Detail label="Baptised" value={member.baptism_date ? formatDate(member.baptism_date) : null} />
              <Detail label="Address" value={member.postal_address} />
              <Detail label="Location" value={member.location_landmark} />
              <Detail label="Occupation" value={member.occupation} />
              <Detail label="Talents" value={member.talents} />
              <Detail label="Emergency contact" value={[member.emergency_name, member.emergency_phone].filter(Boolean).join(' · ')} />
              <Detail label="Prefers" value={(member.communication_prefs ?? []).join(', ')} />
            </dl>
          </div>
          {member.notes && <p className="mt-4 rounded-lg bg-paper p-3 text-sm">{member.notes}</p>}
        </Panel>

        <div className="space-y-6">
          <Panel title="Attendance">
            <p className="font-display text-3xl">{pct(attended, eligible.length)}%</p>
            <p className="text-sm text-slate-600">{attended} of the last {eligible.length} closed services</p>
            <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-sm">
              {eligible.slice(0, 12).map((s) => (
                <li key={s.id} className="flex items-center justify-between border-b border-slate-100 py-1">
                  <span className="truncate">{formatDate(s.service_date, { day: 'numeric', month: 'short' })} {s.title}</span>
                  {presentIds.has(s.id) ? <Badge tone="green">Present</Badge> : <Badge tone="red">Absent</Badge>}
                </li>
              ))}
              {!eligible.length && <li className="text-slate-500">No closed services yet.</li>}
            </ul>
          </Panel>

          <Panel title="Giving">
            <p className="font-display text-3xl">{money(totalGiven)}</p>
            <p className="text-sm text-slate-600">{contributions.length} payments recorded</p>
            <ul className="mt-3 space-y-1 text-sm">
              {byType.map(([name, amount]) => (
                <li key={name} className="flex justify-between"><span>{name}</span><span className="font-semibold tabular-nums">{money(amount)}</span></li>
              ))}
            </ul>
          </Panel>

          <Panel title="What they owe">
            <p className={`font-display text-3xl ${totalOwing > 0 ? 'text-absent' : 'text-pew-600'}`}>{money(totalOwing)}</p>
            <ul className="mt-3 space-y-1.5 text-sm">
              {balances.map((b) => (
                <li key={b.contribution_type_id} className="flex justify-between border-b border-slate-100 pb-1.5">
                  <span>{b.contribution_type}<span className="block text-xs text-slate-500">billed {money(b.billed)} · paid {money(b.paid)}</span></span>
                  <span className={`font-semibold tabular-nums ${Number(b.balance) > 0 ? 'text-absent' : 'text-pew-600'}`}>{money(b.balance)}</span>
                </li>
              ))}
              {!balances.length && <li className="text-slate-500">Nothing billed to this member yet.</li>}
            </ul>
          </Panel>
        </div>
      </div>

      {bills.length > 0 && (
        <Panel title="Bills raised" className="mt-6">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr><th className="pb-2">Date</th><th className="pb-2">What for</th><th className="pb-2 text-right">Amount</th><th className="pb-2 text-right">Settled</th><th className="pb-2 text-right">Outstanding</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bills.map((b) => (
                <tr key={b.id}>
                  <td className="py-2 whitespace-nowrap">{formatDate(b.bill_date, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td className="py-2">{b.run_title}<span className="block text-xs text-slate-500">{b.contribution_type}</span></td>
                  <td className="py-2 text-right tabular-nums">{money(b.amount)}</td>
                  <td className="py-2 text-right tabular-nums text-slate-600">{money(b.settled)}</td>
                  <td className={`py-2 text-right font-semibold tabular-nums ${Number(b.outstanding) > 0 ? 'text-absent' : 'text-pew-600'}`}>
                    {money(b.outstanding)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <Panel title="Payment history" className="mt-6">
        {contributions.length === 0 ? <Empty title="No payments recorded yet" /> : (
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr><th className="pb-2">Date</th><th className="pb-2">Type</th><th className="pb-2">Method</th><th className="pb-2">Reference</th><th className="pb-2 text-right">Amount</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {contributions.map((c) => (
                <tr key={c.id}>
                  <td className="py-2 whitespace-nowrap">{formatDate(c.contribution_date, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td className="py-2">{c.contribution_type}</td>
                  <td className="py-2 text-slate-600">{c.payment_method}</td>
                  <td className="py-2 text-slate-600">{c.reference}</td>
                  <td className="py-2 text-right font-semibold tabular-nums">{money(c.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </>
  )
}

function Detail({ label, value }) {
  if (!value) return null
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}
