import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Upload, Download, Pencil, Trash2, MessageSquare } from 'lucide-react'
import { supabase, fetchAll } from '../lib/supabase'
import { useSettings } from '../context/SettingsContext'
import { downloadCSV, formatDate, matchesSearch, parseCSV, toISODate } from '../lib/utils'
import {
  Badge, Button, Empty, ErrorNote, Field, MultiSelect, PageHeader, Select, Spinner, inputClass,
} from '../components/ui'
import Modal from '../components/Modal'

const EMPTY = {
  full_name: '', member_no: '', group_id: '', phone: '', phone_alt: '', email: '',
  gender: '', date_of_birth: '', marital_status: '', age_group: 'Adults',
  member_type: 'Member', department: '', ministries: [], communication_prefs: [],
  postal_address: '', location_landmark: '', occupation: '', talents: '',
  joined_on: toISODate(new Date()), baptism_date: '', emergency_name: '', emergency_phone: '',
  notes: '', is_active: true,
}

export default function Members() {
  const { activeGroups, groups, lookup } = useSettings()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({ group_id: '', member_type: '', ministry: '', status: 'active' })
  const [editing, setEditing] = useState(null)
  const fileRef = useRef(null)

  async function load() {
    try {
      setMembers(await fetchAll(() => supabase.from('members').select('*').order('full_name').order('id')))
    } catch (e) {
      setError(e)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const groupName = (id) => groups.find((g) => g.id === id)?.name ?? ''

  const filtered = useMemo(
    () =>
      members.filter((m) => {
        if (!matchesSearch(`${m.full_name} ${m.phone ?? ''} ${m.member_no ?? ''}`, query)) return false
        if (filters.group_id && m.group_id !== filters.group_id) return false
        if (filters.member_type && m.member_type !== filters.member_type) return false
        if (filters.ministry && !(m.ministries ?? []).includes(filters.ministry)) return false
        if (filters.status === 'active' && !m.is_active) return false
        if (filters.status === 'inactive' && m.is_active) return false
        return true
      }),
    [members, query, filters]
  )

  const missingGroup = members.filter((m) => m.is_active && !m.group_id).length

  async function remove(m) {
    if (!confirm(`Delete ${m.full_name}? Attendance and giving history will go too. To keep the history, mark them inactive instead.`)) return
    const { error } = await supabase.from('members').delete().eq('id', m.id)
    if (error) setError(error)
    else setMembers((list) => list.filter((x) => x.id !== m.id))
  }

  async function importFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    setNotice(null)
    const rows = parseCSV(await file.text())
    const byName = new Map(groups.map((g) => [g.name.toLowerCase(), g.id]))
    const valid = rows
      .filter((r) => r.full_name)
      .map((r) => ({
        full_name: r.full_name,
        member_no: r.member_no || null,
        group_id: byName.get((r.group || r.group_name || '').toLowerCase()) ?? null,
        phone: r.phone || null,
        phone_alt: r.phone_alt || null,
        email: r.email || null,
        gender: r.gender || null,
        marital_status: r.marital_status || null,
        age_group: r.age_group || 'Adults',
        member_type: r.member_type || r.membership_status || 'Member',
        department: r.department || null,
        ministries: r.ministries ? r.ministries.split(/[;|]/).map((s) => s.trim()).filter(Boolean) : [],
        postal_address: r.postal_address || null,
        location_landmark: r.location_landmark || null,
        date_of_birth: /^\d{4}-\d{2}-\d{2}$/.test(r.date_of_birth || '') ? r.date_of_birth : null,
        joined_on: /^\d{4}-\d{2}-\d{2}$/.test(r.joined_on || '') ? r.joined_on : toISODate(new Date()),
        emergency_name: r.emergency_name || null,
        emergency_phone: r.emergency_phone || null,
        is_active: !/^(no|false|0|inactive)$/i.test(r.is_active || ''),
      }))
    if (!valid.length) return setError('Nothing imported. The file needs a header row with at least a full_name column.')
    for (let i = 0; i < valid.length; i += 400) {
      const { error } = await supabase.from('members').insert(valid.slice(i, i + 400))
      if (error) return setError(error)
    }
    setNotice(`Imported ${valid.length} member${valid.length === 1 ? '' : 's'}.`)
    load()
  }

  function exportCSV() {
    downloadCSV('members.csv', filtered, [
      { label: 'member_no', value: 'member_no' },
      { label: 'full_name', value: 'full_name' },
      { label: 'group', value: (m) => groupName(m.group_id) },
      { label: 'phone', value: 'phone' },
      { label: 'phone_alt', value: 'phone_alt' },
      { label: 'email', value: 'email' },
      { label: 'gender', value: 'gender' },
      { label: 'date_of_birth', value: 'date_of_birth' },
      { label: 'marital_status', value: 'marital_status' },
      { label: 'age_group', value: 'age_group' },
      { label: 'membership_status', value: 'member_type' },
      { label: 'department', value: 'department' },
      { label: 'ministries', value: (m) => (m.ministries ?? []).join('; ') },
      { label: 'postal_address', value: 'postal_address' },
      { label: 'location_landmark', value: 'location_landmark' },
      { label: 'joined_on', value: 'joined_on' },
      { label: 'emergency_name', value: 'emergency_name' },
      { label: 'emergency_phone', value: 'emergency_phone' },
      { label: 'is_active', value: (m) => (m.is_active ? 'yes' : 'no') },
    ])
  }

  const setFilter = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }))

  return (
    <>
      <PageHeader
        title="Members"
        subtitle={`${members.filter((m) => m.is_active).length} active members on the register`}
        actions={
          <>
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={importFile} />
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="size-4" /> Import CSV
            </Button>
            <Button variant="outline" onClick={exportCSV}>
              <Download className="size-4" /> Export
            </Button>
            <Button onClick={() => setEditing(EMPTY)}>
              <Plus className="size-4" /> Add member
            </Button>
          </>
        }
      />
      <ErrorNote error={error} />
      {notice && <div className="mb-4 rounded-lg border border-pew-200 bg-pew-50 px-4 py-3 text-sm text-pew-700">{notice}</div>}
      {missingGroup > 0 && (
        <div className="mb-4 rounded-lg border border-brass-300 bg-brass-100/60 px-4 py-3 text-sm">
          {missingGroup} active {missingGroup === 1 ? 'member has' : 'members have'} no group yet. Group reports will miss them until you assign one.
        </div>
      )}

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative lg:col-span-2">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input className={`${inputClass} pl-9`} placeholder="Search name, phone or number" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Select value={filters.group_id} onChange={setFilter('group_id')} placeholder="All groups"
          options={groups.map((g) => ({ value: g.id, label: g.name }))} />
        <Select value={filters.member_type} onChange={setFilter('member_type')} placeholder="All statuses" options={lookup('membership_status')} />
        <Select value={filters.status} onChange={setFilter('status')} allowEmpty={false}
          options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'all', label: 'Active and inactive' }]} />
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[840px] text-sm">
            <thead className="bg-paper text-left text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Group</th>
                <th className="px-4 py-3 font-semibold">Phone</th>
                <th className="px-4 py-3 font-semibold">Ministry</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Joined</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((m) => (
                <tr key={m.id} className="hover:bg-paper/60">
                  <td className="px-4 py-3">
                    <Link to={`/members/${m.id}`} className="font-medium text-ink hover:text-pew-600 hover:underline">
                      {m.full_name}
                    </Link>
                    {!m.is_active && <span className="ml-2"><Badge>Inactive</Badge></span>}
                    {m.member_no && <span className="ml-2 text-xs text-slate-400">{m.member_no}</span>}
                  </td>
                  <td className="px-4 py-3">
                    {m.group_id ? <Badge tone="green">{groupName(m.group_id)}</Badge> : <Badge tone="red">No group</Badge>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{m.phone}</td>
                  <td className="px-4 py-3 text-slate-600">{(m.ministries ?? []).join(', ') || m.department || '—'}</td>
                  <td className="px-4 py-3"><Badge tone="brass">{m.member_type}</Badge></td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(m.joined_on, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => setEditing(m)} aria-label={`Edit ${m.full_name}`}>
                      <Pencil className="size-4" />
                    </button>
                    <button className="rounded-md p-1.5 text-absent hover:bg-absent/10" onClick={() => remove(m)} aria-label={`Delete ${m.full_name}`}>
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <Empty title={members.length ? 'No members match these filters' : 'No members yet'}>
                      {members.length ? 'Clear a filter to see more.' : 'Add a member, or import your register from a CSV file.'}
                    </Empty>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-xs text-slate-500">
          CSV columns: full_name (required), group, member_no, phone, phone_alt, email, gender, date_of_birth, marital_status,
          age_group, membership_status, department, ministries (separated by ;), postal_address, location_landmark, joined_on,
          emergency_name, emergency_phone, is_active.
        </p>
        <Link to="/sms">
          <Button variant="outline" size="sm">
            <MessageSquare className="size-4" /> Send SMS
          </Button>
        </Link>
      </div>

      <MemberModal
        member={editing}
        groups={activeGroups}
        onClose={() => setEditing(null)}
        onSaved={(saved) => {
          setEditing(null)
          setMembers((list) => {
            const next = list.some((x) => x.id === saved.id) ? list.map((x) => (x.id === saved.id ? saved : x)) : [...list, saved]
            return next.sort((a, b) => a.full_name.localeCompare(b.full_name))
          })
        }}
      />
    </>
  )
}

function MemberModal({ member, groups, onClose, onSaved }) {
  const { lookup } = useSettings()
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!member) return
    const clean = { ...EMPTY }
    for (const key of Object.keys(EMPTY)) {
      const v = member[key]
      clean[key] = v === null || v === undefined ? EMPTY[key] : v
    }
    setForm(clean)
    setError(null)
  }, [member])

  if (!member) return null
  const isNew = !member.id
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  async function submit(e) {
    e.preventDefault()
    if (!form.group_id) return setError('Choose a group. Every member belongs to one.')
    setBusy(true)
    setError(null)
    const payload = {
      ...form,
      full_name: form.full_name.trim(),
      member_no: form.member_no.trim() || null,
      phone: form.phone.trim() || null,
      phone_alt: form.phone_alt.trim() || null,
      email: form.email.trim() || null,
      gender: form.gender || null,
      marital_status: form.marital_status || null,
      department: form.department || null,
      date_of_birth: form.date_of_birth || null,
      baptism_date: form.baptism_date || null,
      postal_address: form.postal_address || null,
      location_landmark: form.location_landmark || null,
      occupation: form.occupation || null,
      talents: form.talents || null,
      emergency_name: form.emergency_name || null,
      emergency_phone: form.emergency_phone || null,
      notes: form.notes || null,
    }
    const { data, error } = isNew
      ? await supabase.from('members').insert(payload).select().single()
      : await supabase.from('members').update(payload).eq('id', member.id).select().single()
    setBusy(false)
    if (error) setError(error)
    else onSaved(data)
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={isNew ? 'Add member' : form.full_name}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="member-form" loading={busy}>{isNew ? 'Add member' : 'Save changes'}</Button>
        </>
      }
    >
      <form id="member-form" onSubmit={submit} className="space-y-5">
        <ErrorNote error={error} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Full name">
              <input required autoFocus className={inputClass} value={form.full_name} onChange={set('full_name')} />
            </Field>
          </div>
          <Field label="Group (required)">
            <Select required value={form.group_id} onChange={set('group_id')} placeholder="Choose a group"
              options={groups.map((g) => ({ value: g.id, label: g.name }))} />
          </Field>
          <Field label="Membership number">
            <input className={inputClass} value={form.member_no} onChange={set('member_no')} placeholder="Optional" />
          </Field>
          <Field label="Phone">
            <input type="tel" className={inputClass} value={form.phone} onChange={set('phone')} placeholder="0241234567" />
          </Field>
          <Field label="Alternative phone">
            <input type="tel" className={inputClass} value={form.phone_alt} onChange={set('phone_alt')} />
          </Field>
          <Field label="Email">
            <input type="email" className={inputClass} value={form.email} onChange={set('email')} />
          </Field>
          <Field label="Gender">
            <Select value={form.gender} onChange={set('gender')} placeholder="Not set" options={lookup('gender')} />
          </Field>
          <Field label="Date of birth">
            <input type="date" className={inputClass} value={form.date_of_birth} onChange={set('date_of_birth')} />
          </Field>
          <Field label="Marital status">
            <Select value={form.marital_status} onChange={set('marital_status')} placeholder="Not set" options={lookup('marital_status')} />
          </Field>
          <Field label="Age group">
            <Select allowEmpty={false} value={form.age_group} onChange={set('age_group')} options={lookup('age_group')} />
          </Field>
          <Field label="Membership status">
            <Select allowEmpty={false} value={form.member_type} onChange={set('member_type')} options={lookup('membership_status')} />
          </Field>
          <Field label="Department">
            <Select value={form.department} onChange={set('department')} placeholder="Unassigned" options={lookup('department')} />
          </Field>
          <Field label="Joined the church on" hint="Services before this date don't count as absences">
            <input type="date" required className={inputClass} value={form.joined_on} onChange={set('joined_on')} />
          </Field>
          <Field label="Baptism date">
            <input type="date" className={inputClass} value={form.baptism_date} onChange={set('baptism_date')} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ministry involvement">
            <MultiSelect values={form.ministries} options={lookup('ministry')} onChange={(v) => setForm((f) => ({ ...f, ministries: v }))} columns={1} />
          </Field>
          <Field label="Preferred way to reach them">
            <MultiSelect values={form.communication_prefs} options={lookup('communication_method')} onChange={(v) => setForm((f) => ({ ...f, communication_prefs: v }))} columns={1} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Postal address">
            <input className={inputClass} value={form.postal_address} onChange={set('postal_address')} />
          </Field>
          <Field label="Location and landmark">
            <input className={inputClass} value={form.location_landmark} onChange={set('location_landmark')} />
          </Field>
          <Field label="Occupation">
            <input className={inputClass} value={form.occupation} onChange={set('occupation')} />
          </Field>
          <Field label="Spiritual gifts or talents">
            <input className={inputClass} value={form.talents} onChange={set('talents')} />
          </Field>
          <Field label="Emergency contact">
            <input className={inputClass} value={form.emergency_name} onChange={set('emergency_name')} />
          </Field>
          <Field label="Emergency contact phone">
            <input type="tel" className={inputClass} value={form.emergency_phone} onChange={set('emergency_phone')} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <textarea rows={2} className={inputClass} value={form.notes} onChange={set('notes')} />
            </Field>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.is_active} onChange={set('is_active')} className="size-4 accent-pew-600" />
          Active (appears on the check-in list, counts toward absences and receives SMS)
        </label>
      </form>
    </Modal>
  )
}
