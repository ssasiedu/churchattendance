import { useEffect, useMemo, useState } from 'react'
import { Printer, Download } from 'lucide-react'
import { supabase, fetchAll } from '../lib/supabase'
import { useSettings } from '../context/SettingsContext'
import { CHART_COLORS } from '../lib/constants'
import { downloadCSV, formatDate, monthKey, monthLabel, toISODate } from '../lib/utils'
import { Button, Empty, ErrorNote, PageHeader, Panel, Select, Spinner, Tabs, inputClass } from '../components/ui'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

const today = () => toISODate(new Date())
const yearStart = () => toISODate(new Date(new Date().getFullYear(), 0, 1))
const axisProps = { tick: { fontSize: 12, fill: '#64748b' }, tickLine: false, axisLine: false }

const TABS = [
  { key: 'income', label: 'Income and expenditure' },
  { key: 'trial', label: 'Trial balance' },
  { key: 'ledger', label: 'Account ledger' },
  { key: 'members', label: 'Member statements' },
]

export default function FinanceReports() {
  const { settings, accounts, money } = useSettings()
  const [tab, setTab] = useState('income')
  const [range, setRange] = useState({ from: yearStart(), to: today() })
  const [lines, setLines] = useState([])
  const [contributions, setContributions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [ledgerAccount, setLedgerAccount] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [l, c] = await Promise.all([
          fetchAll(() => supabase.from('v_journal_lines').select('*')
            .gte('entry_date', range.from).lte('entry_date', range.to).order('entry_date').order('id')),
          fetchAll(() => supabase.from('v_member_contributions').select('*')
            .gte('contribution_date', range.from).lte('contribution_date', range.to).order('id')),
        ])
        setLines(l)
        setContributions(c)
      } catch (e) { setError(e) }
      setLoading(false)
    }
    load()
  }, [range.from, range.to])

  const summary = useMemo(() => {
    const byAccount = new Map()
    for (const l of lines) {
      const cur = byAccount.get(l.account_id) ?? {
        id: l.account_id, code: l.account_code, name: l.account_name, type: l.account_type, debit: 0, credit: 0,
      }
      cur.debit += Number(l.debit)
      cur.credit += Number(l.credit)
      byAccount.set(l.account_id, cur)
    }
    const rows = [...byAccount.values()].sort((a, b) => a.code.localeCompare(b.code))
    const income = rows.filter((r) => r.type === 'Income').map((r) => ({ ...r, amount: r.credit - r.debit }))
    const expense = rows.filter((r) => r.type === 'Expense').map((r) => ({ ...r, amount: r.debit - r.credit }))
    const totalIncome = income.reduce((n, r) => n + r.amount, 0)
    const totalExpense = expense.reduce((n, r) => n + r.amount, 0)

    const monthly = new Map()
    for (const l of lines) {
      if (l.account_type !== 'Income' && l.account_type !== 'Expense') continue
      const k = monthKey(l.entry_date)
      const cur = monthly.get(k) ?? { key: k, label: monthLabel(k), Income: 0, Expenditure: 0 }
      if (l.account_type === 'Income') cur.Income += Number(l.credit) - Number(l.debit)
      else cur.Expenditure += Number(l.debit) - Number(l.credit)
      monthly.set(k, cur)
    }

    const cash = rows.filter((r) => accounts.find((a) => a.id === r.id)?.is_cash)
      .map((r) => ({ ...r, amount: r.debit - r.credit }))

    return {
      rows, income, expense, totalIncome, totalExpense,
      surplus: totalIncome - totalExpense,
      monthly: [...monthly.values()].sort((a, b) => a.key.localeCompare(b.key)),
      cash,
      totalDebit: rows.reduce((n, r) => n + r.debit, 0),
      totalCredit: rows.reduce((n, r) => n + r.credit, 0),
    }
  }, [lines, accounts])

  const memberStatements = useMemo(() => {
    const byMember = new Map()
    const types = new Set()
    for (const c of contributions) {
      if (!c.member_id) continue
      types.add(c.contribution_type)
      const cur = byMember.get(c.member_id) ?? { id: c.member_id, name: c.full_name, group: c.group_name, total: 0, types: {} }
      cur.total += Number(c.amount)
      cur.types[c.contribution_type] = (cur.types[c.contribution_type] ?? 0) + Number(c.amount)
      byMember.set(c.member_id, cur)
    }
    return { rows: [...byMember.values()].sort((a, b) => b.total - a.total), types: [...types].sort() }
  }, [contributions])

  const ledgerRows = useMemo(() => {
    if (!ledgerAccount) return []
    let running = 0
    return lines.filter((l) => l.account_id === ledgerAccount).map((l) => {
      running += Number(l.debit) - Number(l.credit)
      return { ...l, balance: running }
    })
  }, [lines, ledgerAccount])

  return (
    <>
      <PageHeader
        title="Financial reports"
        subtitle={`${formatDate(range.from)} to ${formatDate(range.to)}`}
        actions={<Button variant="outline" onClick={() => window.print()}><Printer className="size-4" /> Print</Button>}
      />

      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <Tabs value={tab} onChange={setTab} options={TABS} />
        <input type="date" className={`${inputClass} ml-auto w-auto`} value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} aria-label="From" />
        <input type="date" className={`${inputClass} w-auto`} value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} aria-label="To" />
      </div>

      <div className="mb-4 hidden items-center gap-3 print:flex">
        {settings?.logo_url && <img src={settings.logo_url} alt="" className="h-12 object-contain" />}
        <div>
          <p className="font-display text-xl">{settings?.church_name}</p>
          <p className="text-sm">{[settings?.location, settings?.address].filter(Boolean).join(', ')}</p>
        </div>
      </div>

      <ErrorNote error={error} />

      {loading ? <Spinner /> : (
        <>
          {tab === 'income' && (
            <div className="space-y-6">
              <div className="grid gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-3">
                <Kpi label="Total income" value={money(summary.totalIncome)} tone="text-pew-600" />
                <Kpi label="Total expenditure" value={money(summary.totalExpense)} tone="text-absent" />
                <Kpi label={summary.surplus >= 0 ? 'Surplus' : 'Deficit'} value={money(Math.abs(summary.surplus))} />
              </div>

              <Panel title="Month by month">
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={summary.monthly} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                      <CartesianGrid stroke="#eef2f6" vertical={false} />
                      <XAxis dataKey="label" {...axisProps} />
                      <YAxis {...axisProps} />
                      <Tooltip formatter={(v) => money(v)} contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />
                      <Legend wrapperStyle={{ fontSize: 13 }} />
                      <Bar dataKey="Income" fill="#2f5d50" radius={[4, 4, 0, 0]} maxBarSize={36} />
                      <Bar dataKey="Expenditure" fill="#c8962e" radius={[4, 4, 0, 0]} maxBarSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Panel>

              <div className="grid gap-6 lg:grid-cols-2">
                <Panel title="Income">
                  <StatementTable rows={summary.income} total={summary.totalIncome} money={money} />
                </Panel>
                <Panel title="Expenditure">
                  <StatementTable rows={summary.expense} total={summary.totalExpense} money={money} />
                </Panel>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Panel title="Where the money is">
                  <ul className="space-y-2 text-sm">
                    {summary.cash.map((c) => (
                      <li key={c.id} className="flex justify-between border-b border-slate-100 pb-2">
                        <span>{c.name}</span><span className="font-semibold tabular-nums">{money(c.amount)}</span>
                      </li>
                    ))}
                    {!summary.cash.length && <li className="text-slate-500">No cash movements in this period.</li>}
                  </ul>
                </Panel>
                <Panel title="Expenditure split">
                  {summary.expense.length ? (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={summary.expense} dataKey="amount" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                            {summary.expense.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(v) => money(v)} />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : <Empty title="No expenses in this period" />}
                </Panel>
              </div>
            </div>
          )}

          {tab === 'trial' && (
            <Panel title="Trial balance" action={
              <Button size="sm" variant="outline" onClick={() => downloadCSV(`trial-balance-${range.to}.csv`, summary.rows, [
                { label: 'Code', value: 'code' }, { label: 'Account', value: 'name' }, { label: 'Type', value: 'type' },
                { label: 'Debit', value: (r) => r.debit.toFixed(2) }, { label: 'Credit', value: (r) => r.credit.toFixed(2) },
              ])}><Download className="size-4" /> Export</Button>
            }>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="text-left text-slate-500">
                    <tr><th className="pb-2">Code</th><th className="pb-2">Account</th><th className="pb-2 text-right">Debit</th><th className="pb-2 text-right">Credit</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {summary.rows.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2 font-mono text-xs text-slate-500">{r.code}</td>
                        <td className="py-2">{r.name}</td>
                        <td className="py-2 text-right tabular-nums">{r.debit ? money(r.debit) : ''}</td>
                        <td className="py-2 text-right tabular-nums">{r.credit ? money(r.credit) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-ink font-semibold">
                      <td className="py-2" colSpan={2}>Total</td>
                      <td className="py-2 text-right tabular-nums">{money(summary.totalDebit)}</td>
                      <td className="py-2 text-right tabular-nums">{money(summary.totalCredit)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {!summary.rows.length && <Empty title="Nothing posted in this period" />}
            </Panel>
          )}

          {tab === 'ledger' && (
            <Panel title="Account ledger" action={
              <Select value={ledgerAccount} onChange={(e) => setLedgerAccount(e.target.value)} placeholder="Choose an account"
                options={accounts.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))} />
            }>
              {!ledgerAccount ? <Empty title="Choose an account">Every posting to it will be listed with a running balance.</Empty> : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="text-left text-slate-500">
                      <tr><th className="pb-2">Date</th><th className="pb-2">Details</th><th className="pb-2 text-right">Debit</th><th className="pb-2 text-right">Credit</th><th className="pb-2 text-right">Balance</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {ledgerRows.map((l) => (
                        <tr key={l.id}>
                          <td className="py-2 whitespace-nowrap">{formatDate(l.entry_date, { day: 'numeric', month: 'short', year: '2-digit' })}</td>
                          <td className="py-2">{l.entry_description}<span className="block text-xs text-slate-500">{l.description}</span></td>
                          <td className="py-2 text-right tabular-nums">{Number(l.debit) ? money(l.debit) : ''}</td>
                          <td className="py-2 text-right tabular-nums">{Number(l.credit) ? money(l.credit) : ''}</td>
                          <td className="py-2 text-right font-semibold tabular-nums">{money(l.balance)}</td>
                        </tr>
                      ))}
                      {!ledgerRows.length && <tr><td colSpan={5}><Empty title="No postings in this period" /></td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          )}

          {tab === 'members' && (
            <Panel title="What each member has paid" action={
              <Button size="sm" variant="outline" onClick={() => downloadCSV(`member-contributions-${range.to}.csv`, memberStatements.rows, [
                { label: 'Member', value: 'name' }, { label: 'Group', value: 'group' },
                ...memberStatements.types.map((t) => ({ label: t, value: (r) => (r.types[t] ?? 0).toFixed(2) })),
                { label: 'Total', value: (r) => r.total.toFixed(2) },
              ])}><Download className="size-4" /> Export</Button>
            }>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="text-left text-slate-500">
                    <tr>
                      <th className="pb-2">Member</th><th className="pb-2">Group</th>
                      {memberStatements.types.map((t) => <th key={t} className="pb-2 text-right">{t}</th>)}
                      <th className="pb-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {memberStatements.rows.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2 font-medium">{r.name}</td>
                        <td className="py-2 text-slate-600">{r.group}</td>
                        {memberStatements.types.map((t) => (
                          <td key={t} className="py-2 text-right tabular-nums">{r.types[t] ? money(r.types[t]) : '—'}</td>
                        ))}
                        <td className="py-2 text-right font-semibold tabular-nums">{money(r.total)}</td>
                      </tr>
                    ))}
                    {!memberStatements.rows.length && (
                      <tr><td colSpan={3}><Empty title="No member payments in this period" /></td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </>
      )}
    </>
  )
}

function Kpi({ label, value, tone }) {
  return (
    <div className="bg-white px-5 py-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-1 font-display text-3xl ${tone ?? ''}`}>{value}</p>
    </div>
  )
}

function StatementTable({ rows, total, money }) {
  if (!rows.length) return <Empty title="Nothing in this period" />
  return (
    <table className="w-full text-sm">
      <tbody className="divide-y divide-slate-100">
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="py-2">{r.name}</td>
            <td className="py-2 text-right tabular-nums">{money(r.amount)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t-2 border-ink font-semibold">
          <td className="py-2">Total</td>
          <td className="py-2 text-right tabular-nums">{money(total)}</td>
        </tr>
      </tfoot>
    </table>
  )
}
