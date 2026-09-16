import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Search, Upload, Download, Pencil, Trash2 } from 'lucide-react'
import { supabase, fetchAll } from '../lib/supabase'
import { AGE_GROUPS, DEPARTMENTS, GENDERS, MEMBER_TYPES } from '../lib/constants'
import { downloadCSV, formatDate, matchesSearch, parseCSV, toISODate } from '../lib/utils'
import { Badge, Button, ErrorNote, Field, PageHeader, Spinner, inputClass } from '../components/ui'
import Modal from '../components/Modal'

const EMPTY = {
  full_name: '',
  phone: '',
  gender: '',
  age_group: 'Adults',
  department: '',
  member_type: 'Member',
  joined_on: toISODate(new Date()),
  is_active: true,
}

const CSV_COLUMNS = [
  { label: 'full_name', value: 'full_name' },
  { label: 'phone', value: 'phone' },
  { label: 'gender', value: 'gender' },
  { label: 'age_group', value: 'age_group' },
  { label: 'department', value: 'department' },
  { label: 'member_type', value: 'member_type' },
  { label: 'joined_on', value: 'joined_on' },
  { label: 'is_active', value: (m) => (m.is_active ? 'yes' : 'no') },
]

export default function Members() {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({ department: '', member_type: '', age_group: '', status: 'active' })
  const [editing, setEditing] = useState(null)
  const fileRef = useRef(null)

  async function load() {
    try {
      const rows = await fetchAll(() => supabase.from('members').select('*').order('full_name').order('id'))
      setMembers(rows)
    } catch (e) {
      setError(e)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(
    () =>
      members.filter((m) => {
        if (!matchesSearch(`${m.full_name} ${m.phone ?? ''}`, query)) return false
        if (filters.department && (m.department || 'Unassigned') !== filters.department) return false
        if (filters.member_type && m.member_type !== filters.member_type) return false
        if (filters.age_group && m.age_group !== filters.age_group) return false
        if (filters.status === 'active' && !m.is_active) return false
        if (filters.status === 'inactive' && m.is_active) return false
        return true
      }),
    [members, query, filters]
  )

  async function remove(m) {
    if (!confirm(`Delete ${m.full_name}? Their attendance history will be deleted too. To keep history, mark them inactive instead.`)) return
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
    const valid = rows
      .filter((r) => r.full_name)
      .map((r) => ({
        full_name: r.full_name,
        phone: r.phone || null,
        gender: GENDERS.includes(r.gender) ? r.gender : null,
        age_group: AGE_GROUPS.includes(r.age_group) ? r.age_group : 'Adults',
        department: r.department || null,
        member_type: MEMBER_TYPES.includes(r.member_type) ? r.member_type : 'Member',
        joined_on: /^\d{4}-\d{2}-\d{2}$/.test(r.joined_on || '') ? r.joined_on : toISODate(new Date()),
        is_active: !/^(no|false|0|inactive)$/i.test(r.is_active || ''),
      }))
    if (!valid.length) {
      setError('No rows imported. The file needs a header row with at least a "full_name" column.')
      return
    }
    for (let i = 0; i < valid.length; i += 500) {
      const { error } = await supabase.from('members').insert(valid.slice(i, i + 500))
      if (error) {
        setError(error)
        return
      }
    }
    setNotice(`Imported ${valid.length} member${valid.length === 1 ? '' : 's'}.`)
    load()
  }

  const setFilter = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }))

  return (
    <>
      <PageHeader
        title="Members"
        subtitle={`${members.filter((m) => m.is_active).length} active on the register`}
        actions={
          <>
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={importFile} />
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="size-4" /> Import CSV
            </Button>
            <Button variant="outline" onClick={() => downloadCSV('members.csv', filtered, CSV_COLUMNS)}>
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

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input className={`${inputClass} pl-9`} placeholder="Search name or phone" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select className={inputClass} value={filters.department} onChange={setFilter('department')}>
          <option value="">All departments</option>
          {[...DEPARTMENTS, 'Unassigned'].map((d) => <option key={d}>{d}</option>)}
        </select>
        <select className={inputClass} value={filters.member_type} onChange={setFilter('member_type')}>
          <option value="">All membership types</option>
          {MEMBER_TYPES.map((d) => <option key={d}>{d}</option>)}
        </select>
        <select className={inputClass} value={filters.age_group} onChange={setFilter('age_group')}>
          <option value="">All age groups</option>
          {AGE_GROUPS.map((d) => <option key={d}>{d}</option>)}
        </select>
        <select className={inputClass} value={filters.status} onChange={setFilter('status')}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">Active and inactive</option>
        </select>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-paper text-left text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Phone</th>
                <th className="px-4 py-3 font-semibold">Department</th>
                <th className="px-4 py-3 font-semibold">Age group</th>
                <th className="px-4 py-3 font-semibold">Membership</th>
                <th className="px-4 py-3 font-semibold">Joined</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((m) => (
                <tr key={m.id} className="hover:bg-paper/60">
                  <td className="px-4 py-3 font-medium">
                    {m.full_name} {!m.is_active && <Badge>Inactive</Badge>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{m.phone}</td>
                  <td className="px-4 py-3 text-slate-600">{m.department || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{m.age_group}</td>
                  <td className="px-4 py-3">
                    <Badge tone={m.member_type === 'Worker' ? 'green' : m.member_type === 'Member' ? 'slate' : 'brass'}>{m.member_type}</Badge>
                  </td>
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
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                    {members.length ? 'No members match these filters.' : 'No members yet. Add one, or import a CSV with a full_name column.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-slate-500">
        CSV columns: full_name (required), phone, gender, age_group, department, member_type, joined_on (YYYY-MM-DD), is_active.
      </p>

      <MemberModal
        member={editing}
        onClose={() => setEditing(null)}
        onSaved={(saved) => {
          setEditing(null)
          setMembers((list) => {
            const exists = list.some((x) => x.id === saved.id)
            const next = exists ? list.map((x) => (x.id === saved.id ? saved : x)) : [...list, saved]
            return next.sort((a, b) => a.full_name.localeCompare(b.full_name))
          })
        }}
      />
    </>
  )
}

function MemberModal({ member, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (member) {
      setForm({ ...EMPTY, ...member, phone: member.phone ?? '', gender: member.gender ?? '', department: member.department ?? '' })
      setError(null)
    }
  }, [member])

  if (!member) return null
  const isNew = !member.id
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const payload = {
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      gender: form.gender || null,
      age_group: form.age_group,
      department: form.department || null,
      member_type: form.member_type,
      joined_on: form.joined_on,
      is_active: form.is_active,
    }
    const query = isNew
      ? supabase.from('members').insert(payload).select().single()
      : supabase.from('members').update(payload).eq('id', member.id).select().single()
    const { data, error } = await query
    setBusy(false)
    if (error) setError(error)
    else onSaved(data)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Add member' : 'Edit member'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="member-form" loading={busy}>{isNew ? 'Add member' : 'Save changes'}</Button>
        </>
      }
    >
      <form id="member-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <ErrorNote error={error} />
          <Field label="Full name">
            <input required autoFocus className={inputClass} value={form.full_name} onChange={set('full_name')} />
          </Field>
        </div>
        <Field label="Phone">
          <input type="tel" className={inputClass} value={form.phone} onChange={set('phone')} />
        </Field>
        <Field label="Gender">
          <select className={inputClass} value={form.gender} onChange={set('gender')}>
            <option value="">Not set</option>
            {GENDERS.map((g) => <option key={g}>{g}</option>)}
          </select>
        </Field>
        <Field label="Age group">
          <select className={inputClass} value={form.age_group} onChange={set('age_group')}>
            {AGE_GROUPS.map((g) => <option key={g}>{g}</option>)}
          </select>
        </Field>
        <Field label="Membership">
          <select className={inputClass} value={form.member_type} onChange={set('member_type')}>
            {MEMBER_TYPES.map((g) => <option key={g}>{g}</option>)}
          </select>
        </Field>
        <Field label="Department">
          <select className={inputClass} value={form.department} onChange={set('department')}>
            <option value="">Unassigned</option>
            {DEPARTMENTS.map((g) => <option key={g}>{g}</option>)}
          </select>
        </Field>
        <Field label="Joined on" hint="Services before this date don't count as absences">
          <input type="date" required className={inputClass} value={form.joined_on} onChange={set('joined_on')} />
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={form.is_active} onChange={set('is_active')} className="size-4 accent-pew-600" />
          Active (appears on the check-in list and counts toward absences)
        </label>
      </form>
    </Modal>
  )
}
