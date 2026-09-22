import { useEffect, useMemo, useState } from 'react'
import { Plus, Download, Trash2, Pencil, Printer } from 'lucide-react'
import { supabase, fetchAll } from '../lib/supabase'
import { useSettings } from '../context/SettingsContext'
import { downloadCSV, formatDate, toISODate } from '../lib/utils'
import { Button, Empty, ErrorNote, Field, PageHeader, Panel, Select, Spinner, inputClass } from '../components/ui'
import Modal from '../components/Modal'

const today = () => toISODate(new Date())
const monthStart = () => toISODate(new Date(new Date().getFullYear(), new Date().getMonth(), 1))

export default function Expenses() {
  const { accounts, activeAccounts, cashAccounts, lookup, money } = useSettings()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null)
  const [range, setRange] = useState({ from: monthStart(), to: today() })
  const [accountFilter, setAccountFilter] = useState('')

  const expenseAccounts = activeAccounts.filter((a) => a.type === 'Expense')
  const accountName = (id) => {
    const a = accounts.find((x) => x.id === id)
    return a ? `${a.code} — ${a.name}` : ''
  }

  async function load() {
    setLoading(true)
    try {
      setRows(await fetchAll(() => supabase.from('expenses').select('*')
        .gte('expense_date', range.from).lte('expense_date', range.to)
        .order('expense_date', { ascending: false }).order('id')))
    } catch (e) { setError(e) }
    setLoading(false)
  }

  useEffect(() => { load() }, [range.from, range.to])

  const filtered = useMemo(() => rows.filter((r) => !accountFilter || r.account_id === accountFilter), [rows, accountFilter])
  const total = filtered.reduce((n, r) => n + Number(r.amount), 0)

  const byAccount = useMemo(() => {
    const map = new Map()
    filtered.forEach((r) => map.set(r.account_id, (map.get(r.account_id) ?? 0) + Number(r.amount)))
    return [...map.entries()].map(([id, amount]) => ({ id, name: accountName(id), amount })).sort((a, b) => b.amount - a.amount)
  }, [filtered, accounts])

  async function remove(r) {
    if (!confirm(`Delete this expense of ${money(r.amount)}? The accounting entry is reversed too.`)) return
    const { error } = await supabase.from('expenses').delete().eq('id', r.id)
    if (error) setError(error)
    else setRows((list) => list.filter((x) => x.id !== r.id))
  }

  return (
    <>
      <PageHeader
        title="Expenses"
        subtitle="Every payment out of church funds, posted straight to the accounts."
        actions={
          <>
            <Button variant="outline" onClick={() => downloadCSV(`expenses-${range.from}-to-${range.to}.csv`, filtered, [
              { label: 'Date', value: 'expense_date' },
              { label: 'Account', value: (r) => accountName(r.account_id) },
              { label: 'Payee', value: 'payee' },
              { label: 'Description', value: 'description' },
              { label: 'Amount', value: 'amount' },
              { label: 'Method', value: 'payment_method' },
              { label: 'Reference', value: 'reference' },
            ])}><Download className="size-4" /> Export</Button>
            <Button variant="outline" onClick={() => window.print()}><Printer className="size-4" /> Print</Button>
            <Button onClick={() => setEditing({})}><Plus className="size-4" /> Record expense</Button>
          </>
        }
      />
      <ErrorNote error={error} />

      <div className="no-print mb-4 grid gap-2 sm:grid-cols-3">
        <input type="date" className={inputClass} value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} aria-label="From" />
        <input type="date" className={inputClass} value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} aria-label="To" />
        <Select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} placeholder="All expense accounts"
          options={expenseAccounts.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))} />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-absent/90 px-5 py-4 text-white">
          <p className="text-sm text-white/80">Total spent</p>
          <p className="mt-1 font-display text-3xl">{money(total)}</p>
          <p className="mt-1 text-xs text-white/80">{filtered.length} payments</p>
        </div>
        <Panel title="Where it went" className="lg:col-span-2">
          <ul className="space-y-1.5 text-sm">
            {byAccount.slice(0, 8).map((a) => (
              <li key={a.id} className="flex justify-between"><span>{a.name}</span><span className="font-semibold tabular-nums">{money(a.amount)}</span></li>
            ))}
            {!byAccount.length && <li className="text-slate-500">Nothing in this period.</li>}
          </ul>
        </Panel>
      </div>

      {loading ? <Spinner /> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-paper text-left text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Account</th>
                <th className="px-4 py-3 font-semibold">Payee</th>
                <th className="px-4 py-3 font-semibold">Description</th>
                <th className="px-4 py-3 text-right font-semibold">Amount</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-paper/60">
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatDate(r.expense_date, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td className="px-4 py-3">{accountName(r.account_id)}</td>
                  <td className="px-4 py-3 text-slate-600">{r.payee}</td>
                  <td className="px-4 py-3 text-slate-600">{r.description}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(r.amount)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => setEditing(r)} aria-label="Edit"><Pencil className="size-4" /></button>
                    <button className="rounded-md p-1.5 text-absent hover:bg-absent/10" onClick={() => remove(r)} aria-label="Delete"><Trash2 className="size-4" /></button>
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={6}><Empty title="No expenses in this period">Record one, or widen the dates.</Empty></td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <ExpenseModal
        entry={editing}
        expenseAccounts={expenseAccounts}
        cashAccounts={cashAccounts}
        methods={lookup('payment_method')}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load() }}
      />
    </>
  )
}

function ExpenseModal({ entry, expenseAccounts, cashAccounts, methods, onClose, onSaved }) {
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!entry) return setForm(null)
    setForm({
      expense_date: entry.expense_date ?? today(),
      account_id: entry.account_id ?? expenseAccounts[0]?.id ?? '',
      cash_account_id: entry.cash_account_id ?? cashAccounts[0]?.id ?? '',
      amount: entry.amount ?? '',
      payee: entry.payee ?? '',
      description: entry.description ?? '',
      reference: entry.reference ?? '',
      payment_method: entry.payment_method ?? methods[0] ?? 'Cash',
    })
    setError(null)
  }, [entry])

  if (!entry || !form) return null
  const isNew = !entry.id
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const payload = { ...form, amount: Number(form.amount), payee: form.payee || null, description: form.description || null, reference: form.reference || null }
    const { error } = isNew
      ? await supabase.from('expenses').insert(payload)
      : await supabase.from('expenses').update(payload).eq('id', entry.id)
    setBusy(false)
    if (error) setError(error)
    else onSaved()
  }

  return (
    <Modal open onClose={onClose} title={isNew ? 'Record an expense' : 'Edit expense'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" form="expense-form" loading={busy}>Save expense</Button></>}>
      <form id="expense-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><ErrorNote error={error} /></div>
        <Field label="Expense account">
          <Select allowEmpty={false} value={form.account_id} onChange={set('account_id')}
            options={expenseAccounts.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))} />
        </Field>
        <Field label="Amount">
          <input type="number" step="0.01" min="0.01" required autoFocus className={inputClass} value={form.amount} onChange={set('amount')} />
        </Field>
        <Field label="Paid from">
          <Select allowEmpty={false} value={form.cash_account_id} onChange={set('cash_account_id')}
            options={cashAccounts.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))} />
        </Field>
        <Field label="Date">
          <input type="date" required className={inputClass} value={form.expense_date} onChange={set('expense_date')} />
        </Field>
        <Field label="Paid to">
          <input className={inputClass} value={form.payee} onChange={set('payee')} placeholder="Supplier or person" />
        </Field>
        <Field label="Payment method">
          <Select allowEmpty={false} value={form.payment_method} onChange={set('payment_method')} options={methods} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Description">
            <input className={inputClass} value={form.description} onChange={set('description')} />
          </Field>
        </div>
        <Field label="Reference">
          <input className={inputClass} value={form.reference} onChange={set('reference')} placeholder="Receipt or voucher number" />
        </Field>
      </form>
    </Modal>
  )
}
