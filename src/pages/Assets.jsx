import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Download, Printer, Search } from 'lucide-react'
import { supabase, fetchAll } from '../lib/supabase'
import { useSettings } from '../context/SettingsContext'
import { downloadCSV, formatDate, matchesSearch, parseDate, toISODate } from '../lib/utils'
import { Badge, Button, Empty, ErrorNote, Field, PageHeader, Panel, Select, Spinner, inputClass } from '../components/ui'
import Modal from '../components/Modal'

const EMPTY = {
  asset_code: '', name: '', category: '', description: '', serial_number: '', supplier: '',
  acquisition_date: toISODate(new Date()), cost: '', quantity: 1, useful_life_years: 5, salvage_value: 0,
  location: '', condition: 'Good', status: 'In use', custodian: '',
  asset_account_id: '', cash_account_id: '', post_to_accounts: false, notes: '',
}

/** Straight-line depreciation, for reporting only */
function depreciation(asset) {
  const cost = Number(asset.cost) * Number(asset.quantity)
  const salvage = Number(asset.salvage_value ?? 0)
  const life = Number(asset.useful_life_years || 1)
  const start = parseDate(asset.acquisition_date)
  if (!start || cost <= 0) return { cost, annual: 0, accumulated: 0, netBook: cost }
  const years = Math.max(0, (Date.now() - start.getTime()) / (365.25 * 24 * 3600 * 1000))
  const annual = Math.max(0, (cost - salvage) / life)
  const accumulated = Math.min(cost - salvage, annual * years)
  return { cost, annual, accumulated, netBook: cost - accumulated }
}

export default function Assets() {
  const { lookup, activeAccounts, cashAccounts, money, refresh } = useSettings()
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null)
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({ category: '', status: '' })

  async function load() {
    try {
      setAssets(await fetchAll(() => supabase.from('assets').select('*').order('name').order('id')))
    } catch (e) { setError(e) }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => assets.filter((a) => {
    if (!matchesSearch(`${a.name} ${a.asset_code ?? ''} ${a.serial_number ?? ''}`, query)) return false
    if (filters.category && a.category !== filters.category) return false
    if (filters.status && a.status !== filters.status) return false
    return true
  }), [assets, query, filters])

  const totals = useMemo(() => filtered.reduce((acc, a) => {
    const d = depreciation(a)
    return { cost: acc.cost + d.cost, netBook: acc.netBook + (a.status === 'Disposed' ? 0 : d.netBook) }
  }, { cost: 0, netBook: 0 }), [filtered])

  async function remove(a) {
    if (!confirm(`Delete ${a.name} from the asset register?`)) return
    const { error } = await supabase.from('assets').delete().eq('id', a.id)
    if (error) setError(error)
    else setAssets((list) => list.filter((x) => x.id !== a.id))
  }

  return (
    <>
      <PageHeader
        title="Fixed assets"
        subtitle="Everything the church owns, what it cost and what it is worth now."
        actions={
          <>
            <Button variant="outline" onClick={() => downloadCSV('assets.csv', filtered, [
              { label: 'Code', value: 'asset_code' }, { label: 'Name', value: 'name' }, { label: 'Category', value: 'category' },
              { label: 'Acquired', value: 'acquisition_date' }, { label: 'Quantity', value: 'quantity' },
              { label: 'Cost each', value: 'cost' }, { label: 'Total cost', value: (a) => depreciation(a).cost.toFixed(2) },
              { label: 'Net book value', value: (a) => depreciation(a).netBook.toFixed(2) },
              { label: 'Location', value: 'location' }, { label: 'Condition', value: 'condition' }, { label: 'Status', value: 'status' },
              { label: 'Custodian', value: 'custodian' }, { label: 'Serial number', value: 'serial_number' },
            ])}><Download className="size-4" /> Export</Button>
            <Button variant="outline" onClick={() => window.print()}><Printer className="size-4" /> Print</Button>
            <Button onClick={() => setEditing(EMPTY)}><Plus className="size-4" /> Add asset</Button>
          </>
        }
      />
      <ErrorNote error={error} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Panel><p className="text-sm text-slate-500">Assets on the register</p><p className="mt-1 font-display text-3xl">{filtered.length}</p></Panel>
        <Panel><p className="text-sm text-slate-500">Total cost</p><p className="mt-1 font-display text-3xl">{money(totals.cost)}</p></Panel>
        <Panel><p className="text-sm text-slate-500">Net book value today</p><p className="mt-1 font-display text-3xl text-pew-600">{money(totals.netBook)}</p></Panel>
      </div>

      <div className="no-print mb-4 grid gap-2 sm:grid-cols-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input className={`${inputClass} pl-9`} placeholder="Search assets" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Select value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))} placeholder="All categories" options={lookup('asset_category')} />
        <Select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} placeholder="All statuses" options={lookup('asset_status')} />
      </div>

      {loading ? <Spinner /> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-paper text-left text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Asset</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold">Acquired</th>
                <th className="px-4 py-3 text-right font-semibold">Cost</th>
                <th className="px-4 py-3 text-right font-semibold">Net book value</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((a) => {
                const d = depreciation(a)
                return (
                  <tr key={a.id} className="hover:bg-paper/60">
                    <td className="px-4 py-3">
                      <p className="font-medium">{a.name}{a.quantity > 1 && <span className="text-slate-500"> ×{a.quantity}</span>}</p>
                      <p className="text-xs text-slate-500">{[a.asset_code, a.location, a.custodian].filter(Boolean).join(' · ')}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{a.category}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatDate(a.acquisition_date, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(d.cost)}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(a.status === 'Disposed' ? 0 : d.netBook)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={a.status === 'In use' ? 'green' : a.status === 'Disposed' || a.status === 'Lost' ? 'red' : 'brass'}>{a.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => setEditing(a)} aria-label="Edit"><Pencil className="size-4" /></button>
                      <button className="rounded-md p-1.5 text-absent hover:bg-absent/10" onClick={() => remove(a)} aria-label="Delete"><Trash2 className="size-4" /></button>
                    </td>
                  </tr>
                )
              })}
              {!filtered.length && <tr><td colSpan={7}><Empty title="No assets yet">Add the church building, instruments, chairs, vehicles and equipment.</Empty></td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <AssetModal
        asset={editing}
        lookup={lookup}
        assetAccounts={activeAccounts.filter((a) => a.type === 'Asset' && !a.is_cash)}
        cashAccounts={cashAccounts}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); refresh() }}
      />
    </>
  )
}

function AssetModal({ asset, lookup, assetAccounts, cashAccounts, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!asset) return
    const clean = { ...EMPTY }
    for (const key of Object.keys(EMPTY)) clean[key] = asset[key] ?? EMPTY[key]
    setForm(clean)
    setError(null)
  }, [asset])

  if (!asset) return null
  const isNew = !asset.id
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const payload = {
      ...form,
      asset_code: form.asset_code || null,
      cost: Number(form.cost || 0),
      quantity: Number(form.quantity || 1),
      useful_life_years: Number(form.useful_life_years || 1),
      salvage_value: Number(form.salvage_value || 0),
      category: form.category || null,
      asset_account_id: form.asset_account_id || null,
      cash_account_id: form.cash_account_id || null,
      description: form.description || null,
      serial_number: form.serial_number || null,
      supplier: form.supplier || null,
      location: form.location || null,
      custodian: form.custodian || null,
      notes: form.notes || null,
    }
    const { error } = isNew
      ? await supabase.from('assets').insert(payload)
      : await supabase.from('assets').update(payload).eq('id', asset.id)
    setBusy(false)
    if (error) setError(error)
    else onSaved()
  }

  return (
    <Modal open onClose={onClose} size="lg" title={isNew ? 'Add asset' : form.name}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" form="asset-form" loading={busy}>Save asset</Button></>}>
      <form id="asset-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><ErrorNote error={error} /></div>
        <div className="sm:col-span-2">
          <Field label="Asset name"><input required autoFocus className={inputClass} value={form.name} onChange={set('name')} /></Field>
        </div>
        <Field label="Asset code"><input className={inputClass} value={form.asset_code} onChange={set('asset_code')} placeholder="e.g. SND-001" /></Field>
        <Field label="Category"><Select value={form.category} onChange={set('category')} placeholder="Choose" options={lookup('asset_category')} /></Field>
        <Field label="Cost each"><input type="number" step="0.01" min="0" className={inputClass} value={form.cost} onChange={set('cost')} /></Field>
        <Field label="Quantity"><input type="number" min="1" className={inputClass} value={form.quantity} onChange={set('quantity')} /></Field>
        <Field label="Date acquired"><input type="date" required className={inputClass} value={form.acquisition_date} onChange={set('acquisition_date')} /></Field>
        <Field label="Supplier"><input className={inputClass} value={form.supplier} onChange={set('supplier')} /></Field>
        <Field label="Useful life (years)" hint="Used to work out the value today">
          <input type="number" min="1" className={inputClass} value={form.useful_life_years} onChange={set('useful_life_years')} />
        </Field>
        <Field label="Value at end of life"><input type="number" step="0.01" min="0" className={inputClass} value={form.salvage_value} onChange={set('salvage_value')} /></Field>
        <Field label="Location"><input className={inputClass} value={form.location} onChange={set('location')} placeholder="Main auditorium" /></Field>
        <Field label="Kept by"><input className={inputClass} value={form.custodian} onChange={set('custodian')} /></Field>
        <Field label="Condition"><Select allowEmpty={false} value={form.condition} onChange={set('condition')} options={lookup('asset_condition')} /></Field>
        <Field label="Status"><Select allowEmpty={false} value={form.status} onChange={set('status')} options={lookup('asset_status')} /></Field>
        <Field label="Serial number"><input className={inputClass} value={form.serial_number} onChange={set('serial_number')} /></Field>
        <div className="sm:col-span-2">
          <Field label="Notes"><textarea rows={2} className={inputClass} value={form.notes} onChange={set('notes')} /></Field>
        </div>

        <div className="rounded-lg border border-slate-200 p-4 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={form.post_to_accounts} onChange={set('post_to_accounts')} className="size-4 accent-pew-600" />
            Post this purchase to the accounts
          </label>
          {form.post_to_accounts && (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field label="Asset account">
                <Select value={form.asset_account_id} onChange={set('asset_account_id')} placeholder="Choose"
                  options={assetAccounts.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))} />
              </Field>
              <Field label="Paid from">
                <Select value={form.cash_account_id} onChange={set('cash_account_id')} placeholder="Choose"
                  options={cashAccounts.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))} />
              </Field>
            </div>
          )}
        </div>
      </form>
    </Modal>
  )
}
