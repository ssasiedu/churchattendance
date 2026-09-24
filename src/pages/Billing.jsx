import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Download, Trash2, MessageSquare, Search, AlertTriangle, Send } from 'lucide-react'
import { supabase, fetchAll } from '../lib/supabase'
import { useSettings } from '../context/SettingsContext'
import { sendSms, fillTemplate } from '../lib/sms'
import { downloadCSV, formatDate, matchesSearch, toISODate } from '../lib/utils'
import { money as fmtMoney } from '../lib/format'
import {
  Badge, Button, Empty, ErrorNote, Field, PageHeader, Select, Spinner, Tabs, inputClass,
} from '../components/ui'
import Modal from '../components/Modal'

const today = () => toISODate(new Date())
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const TABS = [
  { key: 'balances', label: 'Balances and defaulters' },
  { key: 'runs', label: 'Billing history' },
]

export default function Billing() {
  const { settings, billableTypes, accounts, groups, money, symbol, can, refresh } = useSettings()
  const [tab, setTab] = useState('balances')
  const [balances, setBalances] = useState([])
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [typeFilter, setTypeFilter] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [onlyOwing, setOnlyOwing] = useState(true)
  const [query, setQuery] = useState('')
  const [billingOpen, setBillingOpen] = useState(false)
  const [specialOpen, setSpecialOpen] = useState(false)
  const [reminderFor, setReminderFor] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [bal, r] = await Promise.all([
        fetchAll(() => supabase.from('v_member_balances').select('*').eq('is_billable', true).order('full_name').order('contribution_type')),
        supabase.from('billing_runs').select('*, contribution_types(name, kind)').order('created_at', { ascending: false }).limit(60),
      ])
      setBalances(bal)
      setRuns(r.data ?? [])
    } catch (e) { setError(e) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const rows = useMemo(() => balances.filter((b) => {
    if (typeFilter && b.contribution_type_id !== typeFilter) return false
    if (groupFilter && b.group_id !== groupFilter) return false
    if (onlyOwing && Number(b.balance) <= 0) return false
    if (query && !matchesSearch(b.full_name ?? '', query)) return false
    return true
  }), [balances, typeFilter, groupFilter, onlyOwing, query])

  const totals = useMemo(() => rows.reduce((acc, b) => ({
    billed: acc.billed + Number(b.billed),
    paid: acc.paid + Number(b.paid),
    balance: acc.balance + Number(b.balance),
  }), { billed: 0, paid: 0, balance: 0 }), [rows])

  const defaulters = rows.filter((b) => Number(b.balance) > 0)

  async function removeRun(run) {
    if (!confirm(`Remove "${run.title}"? The bills it created and its accounting entry are reversed. Payments already received stay.`)) return
    const { error } = await supabase.rpc('delete_billing_run', { p_run_id: run.id })
    if (error) setError(error.message)
    else { setNotice('Billing run removed.'); load() }
  }

  return (
    <>
      <PageHeader
        title="Billing and balances"
        subtitle="Bill welfare in a batch, raise special contributions, and see who still owes."
        actions={can('finance.record') && (
          <>
            <Button variant="outline" onClick={() => setSpecialOpen(true)}><Plus className="size-4" /> New special contribution</Button>
            <Button onClick={() => setBillingOpen(true)}><Plus className="size-4" /> Run a billing batch</Button>
          </>
        )}
      />
      <ErrorNote error={error} />
      {notice && <div className="mb-4 rounded-lg border border-pew-200 bg-pew-50 px-4 py-3 text-sm text-pew-700">{notice}</div>}

      {billableTypes.length === 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-brass-300 bg-brass-100/60 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-brass-700" />
          <p>
            No payment type is set up for billing yet. Open{' '}
            <Link to="/settings" className="font-semibold underline">Settings → Payment types</Link> and tick
            “Members are billed for this” on Welfare, or raise a special contribution above.
          </p>
        </div>
      )}

      <div className="mb-4"><Tabs value={tab} onChange={setTab} options={TABS} /></div>

      {loading ? <Spinner /> : tab === 'balances' ? (
        <>
          <div className="mb-6 grid gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-4">
            <Kpi label="Billed" value={money(totals.billed)} />
            <Kpi label="Received" value={money(totals.paid)} tone="text-pew-600" />
            <Kpi label="Outstanding" value={money(totals.balance)} tone="text-absent" />
            <Kpi label="Members owing" value={defaulters.length} />
          </div>

          <div className="no-print mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <div className="relative lg:col-span-2">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <input className={`${inputClass} pl-9`} placeholder="Search a member" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} placeholder="All billed types"
              options={billableTypes.map((t) => ({ value: t.id, label: t.name }))} />
            <Select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} placeholder="All groups"
              options={groups.map((g) => ({ value: g.id, label: g.name }))} />
            <label className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm">
              <input type="checkbox" checked={onlyOwing} onChange={(e) => setOnlyOwing(e.target.checked)} className="size-4 accent-pew-600" />
              Only those who owe
            </label>
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadCSV('balances.csv', rows, [
              { label: 'Member', value: 'full_name' }, { label: 'Group', value: 'group_name' },
              { label: 'Type', value: 'contribution_type' }, { label: 'Billed', value: 'billed' },
              { label: 'Paid', value: 'paid' }, { label: 'Balance', value: 'balance' },
              { label: 'Phone', value: 'phone' },
            ])}><Download className="size-4" /> Export</Button>
            {can('sms.send') && defaulters.length > 0 && (
              <Button variant="brass" size="sm" onClick={() => setReminderFor(defaulters)}>
                <MessageSquare className="size-4" /> SMS {defaulters.length} {defaulters.length === 1 ? 'defaulter' : 'defaulters'}
              </Button>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-paper text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Member</th>
                  <th className="px-4 py-3 font-semibold">Group</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 text-right font-semibold">Billed</th>
                  <th className="px-4 py-3 text-right font-semibold">Paid</th>
                  <th className="px-4 py-3 text-right font-semibold">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((b) => (
                  <tr key={`${b.member_id}-${b.contribution_type_id}`} className="hover:bg-paper/60">
                    <td className="px-4 py-3">
                      <Link to={`/members/${b.member_id}`} className="font-medium hover:text-pew-600 hover:underline">{b.full_name}</Link>
                      {b.phone && <span className="block text-xs text-slate-400">{b.phone}</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{b.group_name ?? '—'}</td>
                    <td className="px-4 py-3">{b.contribution_type}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(b.billed)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">{money(b.paid)}</td>
                    <td className={`px-4 py-3 text-right font-semibold tabular-nums ${Number(b.balance) > 0 ? 'text-absent' : 'text-pew-600'}`}>
                      {money(b.balance)}
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr><td colSpan={6}><Empty title={onlyOwing ? 'Nobody owes anything' : 'Nothing billed yet'}>
                    {onlyOwing ? 'Every billed member is up to date.' : 'Run a billing batch to charge members.'}
                  </Empty></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="space-y-3">
          {runs.map((r) => (
            <article key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {r.title} <Badge tone={r.contribution_types?.kind === 'special' ? 'brass' : 'green'}>{r.contribution_types?.name}</Badge>
                </p>
                <p className="mt-0.5 text-sm text-slate-500">
                  {formatDate(r.bill_date, { day: 'numeric', month: 'short', year: 'numeric' })} ·
                  {' '}{r.billed_count} members × {money(r.amount)}
                  {r.due_date && ` · due ${formatDate(r.due_date, { day: 'numeric', month: 'short' })}`}
                  {r.scope_group_id && ` · ${groups.find((g) => g.id === r.scope_group_id)?.name ?? 'one group'}`}
                </p>
              </div>
              <p className="font-display text-xl">{money(r.total_amount)}</p>
              {can('finance.record') && (
                <button className="rounded-md p-1.5 text-absent hover:bg-absent/10" onClick={() => removeRun(r)} aria-label="Remove run">
                  <Trash2 className="size-4" />
                </button>
              )}
            </article>
          ))}
          {!runs.length && (
            <div className="rounded-xl border border-slate-200 bg-white">
              <Empty title="No billing runs yet">Charge welfare for a month, or raise a special contribution.</Empty>
            </div>
          )}
        </div>
      )}

      <BillingRunModal
        open={billingOpen}
        types={billableTypes}
        groups={groups}
        symbol={symbol}
        onClose={() => setBillingOpen(false)}
        onDone={(result) => { setBillingOpen(false); setNotice(`Billed ${result.billed} members, ${fmtMoney(result.total, symbol)} in total.`); load() }}
      />

      <SpecialContributionModal
        open={specialOpen}
        accounts={accounts}
        groups={groups}
        symbol={symbol}
        onClose={() => setSpecialOpen(false)}
        onDone={(result) => { setSpecialOpen(false); setNotice(`Special contribution raised for ${result.billed} members.`); refresh(); load() }}
      />

      <ReminderModal
        rows={reminderFor}
        settings={settings}
        money={money}
        onClose={() => setReminderFor(null)}
      />
    </>
  )
}

function Kpi({ label, value, tone }) {
  return (
    <div className="bg-white px-5 py-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-1 font-display text-2xl ${tone ?? ''}`}>{value}</p>
    </div>
  )
}

function BillingRunModal({ open, types, groups, symbol, onClose, onDone }) {
  const now = new Date()
  const [form, setForm] = useState({
    contribution_type_id: '', title: '', amount: '', bill_date: today(), due_date: '', scope_group_id: '', description: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    const welfare = types.find((t) => t.kind === 'recurring') ?? types[0]
    setForm({
      contribution_type_id: welfare?.id ?? '',
      title: welfare ? `${welfare.name} — ${MONTHS[now.getMonth()]} ${now.getFullYear()}` : '',
      amount: welfare?.default_amount ?? '',
      bill_date: today(),
      due_date: '',
      scope_group_id: '',
      description: '',
    })
    setError(null)
  }, [open, types])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    if (!form.contribution_type_id) return setError('Choose which payment type you are billing.')
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('create_billing_run', {
      p_type_id: form.contribution_type_id,
      p_title: form.title.trim(),
      p_amount: Number(form.amount),
      p_bill_date: form.bill_date,
      p_due_date: form.due_date || null,
      p_group_id: form.scope_group_id || null,
      p_description: form.description || null,
    })
    setBusy(false)
    if (error) setError(error.message)
    else onDone(data)
  }

  return (
    <Modal open={open} onClose={onClose} title="Run a billing batch"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" form="run-form" loading={busy}>Bill members</Button></>}>
      <form id="run-form" onSubmit={submit} className="space-y-4">
        <ErrorNote error={error} />
        <p className="rounded-lg bg-paper px-3 py-2 text-sm text-slate-600">
          Every active member gets the same charge, their balance goes up by it, and the total is posted as
          receivables against the income account for that type.
        </p>
        <Field label="Payment type">
          <Select allowEmpty={false} value={form.contribution_type_id} onChange={set('contribution_type_id')}
            options={types.map((t) => ({ value: t.id, label: t.name }))} />
        </Field>
        <Field label="What to call this run" hint="Shown on statements and in the billing history">
          <input required className={inputClass} value={form.title} onChange={set('title')} placeholder="Welfare — March 2026" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Amount per member (${symbol})`}>
            <input type="number" step="0.01" min="0.01" required className={inputClass} value={form.amount} onChange={set('amount')} />
          </Field>
          <Field label="Bill date">
            <input type="date" required className={inputClass} value={form.bill_date} onChange={set('bill_date')} />
          </Field>
          <Field label="Due date (optional)">
            <input type="date" className={inputClass} value={form.due_date} onChange={set('due_date')} />
          </Field>
          <Field label="Only one group (optional)">
            <Select value={form.scope_group_id} onChange={set('scope_group_id')} placeholder="Everybody"
              options={groups.map((g) => ({ value: g.id, label: g.name }))} />
          </Field>
        </div>
        <Field label="Note">
          <input className={inputClass} value={form.description} onChange={set('description')} />
        </Field>
      </form>
    </Modal>
  )
}

function SpecialContributionModal({ open, accounts, groups, symbol, onClose, onDone }) {
  const [form, setForm] = useState({
    name: '', amount: '', income_account_id: '', cash_account_id: '',
    bill_date: today(), due_date: '', scope_group_id: '', description: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    setForm({
      name: '', amount: '',
      income_account_id: accounts.find((a) => a.code === '4030')?.id ?? accounts.find((a) => a.type === 'Income')?.id ?? '',
      cash_account_id: accounts.find((a) => a.is_cash)?.id ?? '',
      bill_date: today(), due_date: '', scope_group_id: '', description: '',
    })
    setError(null)
  }, [open, accounts])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('create_special_contribution', {
      p_name: form.name.trim(),
      p_amount: Number(form.amount),
      p_income_account_id: form.income_account_id,
      p_cash_account_id: form.cash_account_id,
      p_bill_date: form.bill_date,
      p_due_date: form.due_date || null,
      p_group_id: form.scope_group_id || null,
      p_description: form.description || null,
    })
    setBusy(false)
    if (error) setError(error.message)
    else onDone(data)
  }

  return (
    <Modal open={open} onClose={onClose} title="Raise a special contribution"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" form="special-form" loading={busy}>Raise and bill</Button></>}>
      <form id="special-form" onSubmit={submit} className="space-y-4">
        <ErrorNote error={error} />
        <p className="rounded-lg bg-paper px-3 py-2 text-sm text-slate-600">
          This creates its own payment type, bills every active member, and starts tracking who has paid.
        </p>
        <Field label="What is it for" hint="This becomes the payment type members pay against">
          <input required autoFocus className={inputClass} value={form.name} onChange={set('name')} placeholder="Roofing Project 2026" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Amount per member (${symbol})`}>
            <input type="number" step="0.01" min="0.01" required className={inputClass} value={form.amount} onChange={set('amount')} />
          </Field>
          <Field label="Bill date">
            <input type="date" required className={inputClass} value={form.bill_date} onChange={set('bill_date')} />
          </Field>
          <Field label="Income account it belongs to">
            <Select allowEmpty={false} value={form.income_account_id} onChange={set('income_account_id')}
              options={accounts.filter((a) => a.type === 'Income').map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))} />
          </Field>
          <Field label="Money will be received into">
            <Select allowEmpty={false} value={form.cash_account_id} onChange={set('cash_account_id')}
              options={accounts.filter((a) => a.is_cash).map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))} />
          </Field>
          <Field label="Due date (optional)">
            <input type="date" className={inputClass} value={form.due_date} onChange={set('due_date')} />
          </Field>
          <Field label="Only one group (optional)">
            <Select value={form.scope_group_id} onChange={set('scope_group_id')} placeholder="Everybody"
              options={groups.map((g) => ({ value: g.id, label: g.name }))} />
          </Field>
        </div>
        <Field label="Note">
          <input className={inputClass} value={form.description} onChange={set('description')} />
        </Field>
      </form>
    </Modal>
  )
}

function ReminderModal({ rows, settings, money, onClose }) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (rows) {
      setBody(settings?.sms_billing_template ?? 'Dear {name}, your {type} balance is {balance}. Kindly settle it. - {church}')
      setError(null)
      setResult(null)
    }
  }, [rows, settings])

  if (!rows) return null

  async function send() {
    setBusy(true)
    setError(null)
    let sent = 0
    let failed = 0
    // Each person gets their own figures, so they go out one at a time
    for (const r of rows) {
      const text = fillTemplate(body, {
        type: r.contribution_type,
        amount: money(r.billed),
        balance: money(r.balance),
        due: '',
      })
      const res = await sendSms({
        body: text,
        audience: 'billing',
        audienceLabel: `${r.contribution_type} reminder — ${r.full_name}`,
        recipients: [{ id: r.member_id, full_name: r.full_name, phone: r.phone }],
        dial: settings?.country_dial_code,
      })
      if (res.error) failed += 1
      else sent += res.sent ?? 0
    }
    setBusy(false)
    setResult({ sent, failed })
  }

  return (
    <Modal open onClose={onClose} title={`Remind ${rows.length} ${rows.length === 1 ? 'member' : 'members'}`} size="md"
      footer={<><Button variant="ghost" onClick={onClose}>Close</Button><Button onClick={send} loading={busy}><Send className="size-4" /> Send reminders</Button></>}>
      <ErrorNote error={error} />
      <Field label="Message" hint="Each person gets their own balance filled in">
        <textarea rows={4} className={inputClass} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <p className="mt-2 text-xs text-slate-500">
        Placeholders: {'{name}'} {'{church}'} {'{type}'} {'{amount}'} {'{balance}'}
      </p>
      {rows[0] && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-paper p-3 text-sm">
          <p className="mb-1 text-xs text-slate-500">Preview for {rows[0].full_name}</p>
          {fillTemplate(body, {
            name: rows[0].full_name.split(' ')[0],
            church: settings?.church_name,
            type: rows[0].contribution_type,
            amount: money(rows[0].billed),
            balance: money(rows[0].balance),
            due: '',
          })}
        </div>
      )}
      {result && (
        <p className="mt-3 text-sm text-pew-600">
          Sent {result.sent}{result.failed ? `, ${result.failed} failed` : ''}.
        </p>
      )}
    </Modal>
  )
}
