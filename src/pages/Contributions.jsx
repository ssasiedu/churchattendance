import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Download, Trash2, Pencil, Search, Printer } from 'lucide-react'
import { supabase, fetchAll } from '../lib/supabase'
import { useSettings } from '../context/SettingsContext'
import { downloadCSV, formatDate, matchesSearch, toISODate } from '../lib/utils'
import { Badge, Button, Empty, ErrorNote, Field, PageHeader, Panel, Select, Spinner, inputClass } from '../components/ui'
import Modal from '../components/Modal'

const today = () => toISODate(new Date())
const monthStart = () => toISODate(new Date(new Date().getFullYear(), new Date().getMonth(), 1))

export default function Contributions() {
  const { activeContributionTypes, contributionTypes, cashAccounts, groups, lookup, money } = useSettings()
  const [rows, setRows] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null)
  const [range, setRange] = useState({ from: monthStart(), to: today() })
  const [filters, setFilters] = useState({ type: '', group: '' })
  const [query, setQuery] = useState('')

  async function load() {
    setLoading(true)
    try {
      const [list, mem] = await Promise.all([
        fetchAll(() => supabase.from('v_member_contributions').select('*')
          .gte('contribution_date', range.from).lte('contribution_date', range.to)
          .order('contribution_date', { ascending: false }).order('id')),
        fetchAll(() => supabase.from('members').select('id, full_name, group_id, is_active').order('full_name').order('id')),
      ])
      setRows(list)
      setMembers(mem)
    } catch (e) { setError(e) }
    setLoading(false)
  }

  useEffect(() => { load() }, [range.from, range.to])

  const filtered = useMemo(() => rows.filter((r) => {
    if (filters.type && r.contribution_type_id !== filters.type) return false
    if (filters.group && r.group_id !== filters.group) return false
    if (query && !matchesSearch(`${r.full_name ?? ''} ${r.reference ?? ''}`, query)) return false
    return true
  }), [rows, filters, query])

  const total = filtered.reduce((n, r) => n + Number(r.amount), 0)
  const byType = useMemo(() => {
    const map = new Map()
    filtered.forEach((r) => map.set(r.contribution_type, (map.get(r.contribution_type) ?? 0) + Number(r.amount)))
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [filtered])

  const byGroup = useMemo(() => {
    const map = new Map()
    filtered.forEach((r) => {
      const key = r.group_name ?? 'No group'
      map.set(key, (map.get(key) ?? 0) + Number(r.amount))
    })
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [filtered])

  async function remove(r) {
    if (!confirm(`Delete this ${r.contribution_type} of ${money(r.amount)}? The accounting entry is reversed too.`)) return
    const { error } = await supabase.from('contributions').delete().eq('id', r.id)
    if (error) setError(error)
    else setRows((list) => list.filter((x) => x.id !== r.id))
  }

  function exportCSV() {
    downloadCSV(`contributions-${range.from}-to-${range.to}.csv`, filtered, [
      { label: 'Date', value: 'contribution_date' },
      { label: 'Member', value: (r) => r.full_name ?? 'General' },
      { label: 'Group', value: (r) => r.group_name ?? '' },
      { label: 'Type', value: 'contribution_type' },
      { label: 'Amount', value: 'amount' },
      { label: 'Method', value: 'payment_method' },
      { label: 'Reference', value: 'reference' },
      { label: 'Note', value: 'note' },
    ])
  }

  return (
    <>
      <PageHeader
        title="Contributions"
        subtitle="Tithes, welfare, special contributions and offerings. Every entry posts to the chart of accounts."
        actions={
          <>
            <Button variant="outline" onClick={exportCSV}><Download className="size-4" /> Export</Button>
            <Button variant="outline" onClick={() => window.print()}><Printer className="size-4" /> Print</Button>
            <Button onClick={() => setEditing({})}><Plus className="size-4" /> Record payment</Button>
          </>
        }
      />
      <ErrorNote error={error} />

      <div className="no-print mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <input type="date" className={inputClass} value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} aria-label="From" />
        <input type="date" className={inputClass} value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} aria-label="To" />
        <Select value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))} placeholder="All types"
          options={contributionTypes.map((t) => ({ value: t.id, label: t.name }))} />
        <Select value={filters.group} onChange={(e) => setFilters((f) => ({ ...f, group: e.target.value }))} placeholder="All groups"
          options={groups.map((g) => ({ value: g.id, label: g.name }))} />
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input className={`${inputClass} pl-9`} placeholder="Search member" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-pew-900 px-5 py-4 text-white">
          <p className="text-sm text-pew-200">Total received</p>
          <p className="mt-1 font-display text-3xl">{money(total)}</p>
          <p className="mt-1 text-xs text-pew-200">{filtered.length} entries · {formatDate(range.from, { day: 'numeric', month: 'short' })} to {formatDate(range.to, { day: 'numeric', month: 'short' })}</p>
        </div>
        <Panel title="By type" className="lg:col-span-1">
          <ul className="space-y-1.5 text-sm">
            {byType.map(([name, amount]) => (
              <li key={name} className="flex justify-between"><span>{name}</span><span className="font-semibold tabular-nums">{money(amount)}</span></li>
            ))}
            {!byType.length && <li className="text-slate-500">Nothing in this period.</li>}
          </ul>
        </Panel>
        <Panel title="By group">
          <ul className="space-y-1.5 text-sm">
            {byGroup.slice(0, 6).map(([name, amount]) => (
              <li key={name} className="flex justify-between"><span>{name}</span><span className="font-semibold tabular-nums">{money(amount)}</span></li>
            ))}
            {!byGroup.length && <li className="text-slate-500">Nothing in this period.</li>}
          </ul>
        </Panel>
      </div>

      {loading ? <Spinner /> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-paper text-left text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Member</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Method</th>
                <th className="px-4 py-3 text-right font-semibold">Amount</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-paper/60">
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatDate(r.contribution_date, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td className="px-4 py-3">
                    {r.member_id
                      ? <Link to={`/members/${r.member_id}`} className="font-medium hover:text-pew-600 hover:underline">{r.full_name}</Link>
                      : <span className="text-slate-500">General</span>}
                    {r.group_name && <span className="ml-2 text-xs text-slate-400">{r.group_name}</span>}
                  </td>
                  <td className="px-4 py-3"><Badge tone="green">{r.contribution_type}</Badge></td>
                  <td className="px-4 py-3 text-slate-600">{r.payment_method}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(r.amount)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => setEditing(r)} aria-label="Edit"><Pencil className="size-4" /></button>
                    <button className="rounded-md p-1.5 text-absent hover:bg-absent/10" onClick={() => remove(r)} aria-label="Delete"><Trash2 className="size-4" /></button>
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={6}><Empty title="No payments in this period">Record a payment, or widen the dates.</Empty></td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <ContributionModal
        entry={editing}
        members={members.filter((m) => m.is_active)}
        types={activeContributionTypes}
        cashAccounts={cashAccounts}
        methods={lookup('payment_method')}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load() }}
      />
    </>
  )
}

function ContributionModal({ entry, members, types, cashAccounts, methods, onClose, onSaved }) {
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [keepOpen, setKeepOpen] = useState(true)

  useEffect(() => {
    if (!entry) return setForm(null)
    setForm({
      member_id: entry.member_id ?? '',
      contribution_type_id: entry.contribution_type_id ?? types[0]?.id ?? '',
      amount: entry.amount ?? '',
      contribution_date: entry.contribution_date ?? today(),
      payment_method: entry.payment_method ?? methods[0] ?? 'Cash',
      cash_account_id: entry.cash_account_id ?? '',
      reference: entry.reference ?? '',
      note: entry.note ?? '',
    })
    setError(null)
  }, [entry])

  if (!entry || !form) return null
  const isNew = !entry.id
  const type = types.find((t) => t.id === form.contribution_type_id)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    if (type?.per_member && !form.member_id) return setError(`Choose the member this ${type.name.toLowerCase()} is for.`)
    setBusy(true)
    setError(null)
    const payload = {
      member_id: form.member_id || null,
      contribution_type_id: form.contribution_type_id,
      amount: Number(form.amount),
      contribution_date: form.contribution_date,
      payment_method: form.payment_method,
      cash_account_id: form.cash_account_id || null,
      reference: form.reference || null,
      note: form.note || null,
    }
    const { error } = isNew
      ? await supabase.from('contributions').insert(payload)
      : await supabase.from('contributions').update(payload).eq('id', entry.id)
    setBusy(false)
    if (error) return setError(error)
    if (isNew && keepOpen) {
      setForm((f) => ({ ...f, member_id: '', amount: '', reference: '', note: '' }))
      return
    }
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title={isNew ? 'Record a payment' : 'Edit payment'}
      footer={<><Button variant="ghost" onClick={onClose}>Close</Button><Button type="submit" form="contribution-form" loading={busy}>{isNew ? 'Save payment' : 'Save changes'}</Button></>}>
      <form id="contribution-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><ErrorNote error={error} /></div>
        <Field label="Payment type">
          <Select allowEmpty={false} value={form.contribution_type_id} onChange={set('contribution_type_id')}
            options={types.map((t) => ({ value: t.id, label: t.name }))} />
        </Field>
        <Field label="Amount">
          <input type="number" step="0.01" min="0.01" required autoFocus className={inputClass} value={form.amount} onChange={set('amount')} />
        </Field>
        <div className="sm:col-span-2">
          <Field label={type?.per_member ? 'Member' : 'Member (optional)'}>
            <Select value={form.member_id} onChange={set('member_id')} placeholder={type?.per_member ? 'Choose a member' : 'General / not a specific member'}
              options={members.map((m) => ({ value: m.id, label: m.full_name }))} />
          </Field>
        </div>
        <Field label="Date">
          <input type="date" required className={inputClass} value={form.contribution_date} onChange={set('contribution_date')} />
        </Field>
        <Field label="Payment method">
          <Select allowEmpty={false} value={form.payment_method} onChange={set('payment_method')} options={methods} />
        </Field>
        <Field label="Received into" hint="Leave blank to use the default for this payment type">
          <Select value={form.cash_account_id} onChange={set('cash_account_id')} placeholder="Default account"
            options={cashAccounts.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))} />
        </Field>
        <Field label="Reference">
          <input className={inputClass} value={form.reference} onChange={set('reference')} placeholder="Receipt number" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Note">
            <input className={inputClass} value={form.note} onChange={set('note')} />
          </Field>
        </div>
        {isNew && (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={keepOpen} onChange={(e) => setKeepOpen(e.target.checked)} className="size-4 accent-pew-600" />
            Keep this form open so I can enter the next payment
          </label>
        )}
      </form>
    </Modal>
  )
}
