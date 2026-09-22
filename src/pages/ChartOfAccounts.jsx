import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Download } from 'lucide-react'
import { supabase, fetchAll } from '../lib/supabase'
import { useSettings } from '../context/SettingsContext'
import { ACCOUNT_TYPES } from '../lib/constants'
import { downloadCSV } from '../lib/utils'
import { Badge, Button, Empty, ErrorNote, Field, PageHeader, Select, Spinner, Tabs, inputClass } from '../components/ui'
import Modal from '../components/Modal'

const EMPTY = { code: '', name: '', type: 'Expense', subtype: '', is_cash: false, description: '', is_active: true }

export default function ChartOfAccounts() {
  const { accounts, refresh, money } = useSettings()
  const [balances, setBalances] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null)
  const [tab, setTab] = useState('All')

  useEffect(() => {
    async function load() {
      try {
        const lines = await fetchAll(() => supabase.from('journal_lines').select('account_id, debit, credit').order('id'))
        const map = {}
        for (const l of lines) map[l.account_id] = (map[l.account_id] ?? 0) + Number(l.debit) - Number(l.credit)
        setBalances(map)
      } catch (e) { setError(e) }
      setLoading(false)
    }
    load()
  }, [])

  const rows = useMemo(
    () => accounts.filter((a) => tab === 'All' || a.type === tab).sort((a, b) => a.code.localeCompare(b.code)),
    [accounts, tab]
  )

  /** Income, liability and equity accounts are credit-balance accounts */
  const signed = (a) => (['Income', 'Liability', 'Equity'].includes(a.type) ? -(balances[a.id] ?? 0) : balances[a.id] ?? 0)

  async function remove(a) {
    if (!confirm(`Delete account ${a.code} — ${a.name}? Accounts already used in entries cannot be deleted; switch them off instead.`)) return
    const { error } = await supabase.from('accounts').delete().eq('id', a.id)
    if (error) setError('This account is used by existing entries, so it cannot be deleted. Switch it off instead.')
    else refresh()
  }

  return (
    <>
      <PageHeader
        title="Chart of accounts"
        subtitle="The accounts every contribution, expense and journal entry is posted to."
        actions={
          <>
            <Button variant="outline" onClick={() => downloadCSV('chart-of-accounts.csv', accounts, [
              { label: 'Code', value: 'code' }, { label: 'Name', value: 'name' }, { label: 'Type', value: 'type' },
              { label: 'Subtype', value: 'subtype' }, { label: 'Balance', value: (a) => signed(a).toFixed(2) },
            ])}><Download className="size-4" /> Export</Button>
            <Button onClick={() => setEditing(EMPTY)}><Plus className="size-4" /> New account</Button>
          </>
        }
      />
      <ErrorNote error={error} />

      <div className="mb-4">
        <Tabs value={tab} onChange={setTab} options={['All', ...ACCOUNT_TYPES].map((t) => ({ key: t, label: t }))} />
      </div>

      {loading ? <Spinner /> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-paper text-left text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Code</th>
                <th className="px-4 py-3 font-semibold">Account</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 text-right font-semibold">Balance</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((a) => (
                <tr key={a.id} className="hover:bg-paper/60">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{a.code}</td>
                  <td className="px-4 py-3">
                    <span className="font-medium">{a.name}</span>
                    {a.is_cash && <span className="ml-2"><Badge tone="brass">Cash / bank</Badge></span>}
                    {!a.is_active && <span className="ml-2"><Badge>Off</Badge></span>}
                    {a.subtype && <p className="text-xs text-slate-500">{a.subtype}</p>}
                  </td>
                  <td className="px-4 py-3"><Badge tone={a.type === 'Income' ? 'green' : a.type === 'Expense' ? 'red' : 'slate'}>{a.type}</Badge></td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(signed(a))}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => setEditing(a)} aria-label="Edit"><Pencil className="size-4" /></button>
                    <button className="rounded-md p-1.5 text-absent hover:bg-absent/10" onClick={() => remove(a)} aria-label="Delete"><Trash2 className="size-4" /></button>
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={5}><Empty title="No accounts of this type">Add one to start posting to it.</Empty></td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <AccountModal account={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh() }} />
    </>
  )
}

function AccountModal({ account, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!account) return
    setForm({ ...EMPTY, ...account, subtype: account.subtype ?? '', description: account.description ?? '' })
    setError(null)
  }, [account])

  if (!account) return null
  const isNew = !account.id
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const payload = {
      code: form.code.trim(), name: form.name.trim(), type: form.type,
      subtype: form.subtype || null, is_cash: form.is_cash, description: form.description || null, is_active: form.is_active,
    }
    const { error } = isNew
      ? await supabase.from('accounts').insert(payload)
      : await supabase.from('accounts').update(payload).eq('id', account.id)
    setBusy(false)
    if (error) setError(error.message?.includes('duplicate') ? 'That account code is already in use.' : error)
    else onSaved()
  }

  return (
    <Modal open onClose={onClose} title={isNew ? 'New account' : 'Edit account'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" form="account-form" loading={busy}>Save account</Button></>}>
      <form id="account-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><ErrorNote error={error} /></div>
        <Field label="Code" hint="1000s assets, 2000s liabilities, 4000s income, 5000s expenses">
          <input required autoFocus className={inputClass} value={form.code} onChange={set('code')} />
        </Field>
        <Field label="Type">
          <Select allowEmpty={false} value={form.type} onChange={set('type')} options={ACCOUNT_TYPES} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Account name">
            <input required className={inputClass} value={form.name} onChange={set('name')} />
          </Field>
        </div>
        <Field label="Grouping" hint="Optional, e.g. Administration">
          <input className={inputClass} value={form.subtype} onChange={set('subtype')} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Description">
            <input className={inputClass} value={form.description} onChange={set('description')} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={form.is_cash} onChange={set('is_cash')} className="size-4 accent-pew-600" />
          This is a cash, bank or mobile money account (money can be received into and paid out of it)
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={form.is_active} onChange={set('is_active')} className="size-4 accent-pew-600" />
          Active
        </label>
      </form>
    </Modal>
  )
}
