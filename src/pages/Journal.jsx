import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { supabase, fetchAll } from '../lib/supabase'
import { useSettings } from '../context/SettingsContext'
import { formatDate, toISODate } from '../lib/utils'
import { Badge, Button, Empty, ErrorNote, Field, PageHeader, Select, Spinner, inputClass } from '../components/ui'
import Modal from '../components/Modal'

const today = () => toISODate(new Date())
const blankLine = () => ({ account_id: '', debit: '', credit: '', description: '' })

export default function Journal() {
  const { activeAccounts, money } = useSettings()
  const [entries, setEntries] = useState([])
  const [lines, setLines] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [open, setOpen] = useState(false)
  const [range, setRange] = useState({ from: toISODate(new Date(new Date().getFullYear(), new Date().getMonth() - 2, 1)), to: today() })

  async function load() {
    setLoading(true)
    try {
      const rows = await fetchAll(() => supabase.from('v_journal_lines').select('*')
        .gte('entry_date', range.from).lte('entry_date', range.to)
        .order('entry_date', { ascending: false }).order('id'))
      setLines(rows)
      const map = new Map()
      for (const l of rows) {
        if (!map.has(l.entry_id)) {
          map.set(l.entry_id, {
            id: l.entry_id, entry_date: l.entry_date, reference: l.reference,
            description: l.entry_description, source: l.source, lines: [],
          })
        }
        map.get(l.entry_id).lines.push(l)
      }
      setEntries([...map.values()])
    } catch (e) { setError(e) }
    setLoading(false)
  }

  useEffect(() => { load() }, [range.from, range.to])

  const totals = useMemo(() => ({
    debit: lines.reduce((n, l) => n + Number(l.debit), 0),
    credit: lines.reduce((n, l) => n + Number(l.credit), 0),
  }), [lines])

  async function remove(entry) {
    if (entry.source !== 'manual') {
      return setError('This entry was created by a contribution, expense or asset. Delete it from that page instead.')
    }
    if (!confirm('Delete this journal entry?')) return
    const { error } = await supabase.from('journal_entries').delete().eq('id', entry.id)
    if (error) setError(error)
    else load()
  }

  return (
    <>
      <PageHeader
        title="Journal entries"
        subtitle="Every posting in the books, including the ones created automatically. Add manual entries for receivables, payables and corrections."
        actions={<Button onClick={() => setOpen(true)}><Plus className="size-4" /> New journal entry</Button>}
      />
      <ErrorNote error={error} />

      <div className="mb-4 flex flex-wrap gap-2">
        <input type="date" className={`${inputClass} w-auto`} value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} aria-label="From" />
        <input type="date" className={`${inputClass} w-auto`} value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} aria-label="To" />
        <span className="ml-auto self-center text-sm text-slate-500">
          Debits {money(totals.debit)} · Credits {money(totals.credit)}
        </span>
      </div>

      {loading ? <Spinner /> : entries.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white"><Empty title="No entries in this period">Record a contribution or expense, or add a manual entry.</Empty></div>
      ) : (
        <div className="space-y-3">
          {entries.map((e) => (
            <article key={e.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-paper px-4 py-2.5 text-sm">
                <span className="font-semibold">{formatDate(e.entry_date, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                <span className="text-slate-600">{e.description}</span>
                {e.reference && <span className="text-slate-400">#{e.reference}</span>}
                <Badge tone={e.source === 'manual' ? 'slate' : 'green'}>{e.source}</Badge>
                {e.source === 'manual' && (
                  <button className="ml-auto rounded-md p-1 text-absent hover:bg-absent/10" onClick={() => remove(e)} aria-label="Delete entry">
                    <Trash2 className="size-4" />
                  </button>
                )}
              </header>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-50">
                  {e.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="px-4 py-2 font-mono text-xs text-slate-500">{l.account_code}</td>
                      <td className="px-2 py-2">{l.account_name}<span className="block text-xs text-slate-500">{l.description}</span></td>
                      <td className="px-4 py-2 text-right tabular-nums">{Number(l.debit) ? money(l.debit) : ''}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-600">{Number(l.credit) ? money(l.credit) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          ))}
        </div>
      )}

      <JournalModal open={open} accounts={activeAccounts} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load() }} />
    </>
  )
}

function JournalModal({ open, accounts, onClose, onSaved }) {
  const { money } = useSettings()
  const [header, setHeader] = useState({ entry_date: today(), reference: '', description: '' })
  const [rows, setRows] = useState([blankLine(), blankLine()])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (open) {
      setHeader({ entry_date: today(), reference: '', description: '' })
      setRows([blankLine(), blankLine()])
      setError(null)
    }
  }, [open])

  const totals = rows.reduce(
    (acc, r) => ({ debit: acc.debit + Number(r.debit || 0), credit: acc.credit + Number(r.credit || 0) }),
    { debit: 0, credit: 0 }
  )
  const balanced = totals.debit > 0 && Math.abs(totals.debit - totals.credit) < 0.005

  function setLine(i, key, value) {
    setRows((list) => list.map((r, idx) => {
      if (idx !== i) return r
      if (key === 'debit') return { ...r, debit: value, credit: value ? '' : r.credit }
      if (key === 'credit') return { ...r, credit: value, debit: value ? '' : r.debit }
      return { ...r, [key]: value }
    }))
  }

  async function submit(e) {
    e.preventDefault()
    const payload = rows
      .filter((r) => r.account_id && (Number(r.debit) > 0 || Number(r.credit) > 0))
      .map((r) => ({ account_id: r.account_id, debit: Number(r.debit || 0), credit: Number(r.credit || 0), description: r.description || null }))
    if (payload.length < 2) return setError('A journal entry needs at least two lines.')
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('post_manual_journal', {
      p_entry_date: header.entry_date,
      p_reference: header.reference || null,
      p_description: header.description || null,
      p_lines: payload,
    })
    setBusy(false)
    if (error) setError(error.message)
    else onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title="New journal entry"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" form="journal-form" loading={busy} disabled={!balanced}>Post entry</Button></>}>
      <form id="journal-form" onSubmit={submit} className="space-y-4">
        <ErrorNote error={error} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Date"><input type="date" required className={inputClass} value={header.entry_date} onChange={(e) => setHeader((h) => ({ ...h, entry_date: e.target.value }))} /></Field>
          <Field label="Reference"><input className={inputClass} value={header.reference} onChange={(e) => setHeader((h) => ({ ...h, reference: e.target.value }))} /></Field>
          <Field label="Description"><input className={inputClass} value={header.description} onChange={(e) => setHeader((h) => ({ ...h, description: e.target.value }))} /></Field>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-slate-500">
              <tr><th className="pb-1 font-medium">Account</th><th className="pb-1 font-medium">Narration</th><th className="pb-1 text-right font-medium">Debit</th><th className="pb-1 text-right font-medium">Credit</th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="py-1 pr-2">
                    <Select value={r.account_id} onChange={(e) => setLine(i, 'account_id', e.target.value)} placeholder="Choose account"
                      options={accounts.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))} />
                  </td>
                  <td className="py-1 pr-2"><input className={inputClass} value={r.description} onChange={(e) => setLine(i, 'description', e.target.value)} /></td>
                  <td className="py-1 pr-2"><input type="number" step="0.01" min="0" className={`${inputClass} text-right`} value={r.debit} onChange={(e) => setLine(i, 'debit', e.target.value)} /></td>
                  <td className="py-1"><input type="number" step="0.01" min="0" className={`${inputClass} text-right`} value={r.credit} onChange={(e) => setLine(i, 'credit', e.target.value)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={() => setRows((l) => [...l, blankLine()])}>Add line</Button>
          <span className={`ml-auto text-sm ${balanced ? 'text-pew-600' : 'text-absent'}`}>
            Debits {money(totals.debit)} · Credits {money(totals.credit)}
            {balanced ? ' · balanced' : ' · must balance before posting'}
          </span>
        </div>
      </form>
    </Modal>
  )
}
