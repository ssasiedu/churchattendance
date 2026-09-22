import { useEffect, useRef, useState } from 'react'
import { Upload, Plus, Trash2, Pencil, Check, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSettings } from '../context/SettingsContext'
import { LOOKUP_CATEGORIES } from '../lib/constants'
import {
  Badge, Button, Empty, ErrorNote, Field, PageHeader, Panel, Select, Tabs, inputClass,
} from '../components/ui'
import Modal from '../components/Modal'

const TABS = [
  { key: 'church', label: 'Church profile' },
  { key: 'sms', label: 'SMS' },
  { key: 'groups', label: 'Groups' },
  { key: 'contributions', label: 'Payment types' },
  { key: 'dropdowns', label: 'Dropdowns' },
]

export default function Settings() {
  const [tab, setTab] = useState('church')
  return (
    <>
      <PageHeader title="Settings" subtitle="Set this up once and the whole system follows it." />
      <div className="mb-6"><Tabs value={tab} onChange={setTab} options={TABS} /></div>
      {tab === 'church' && <ChurchProfile />}
      {tab === 'sms' && <SmsSettings />}
      {tab === 'groups' && <Groups />}
      {tab === 'contributions' && <ContributionTypes />}
      {tab === 'dropdowns' && <Dropdowns />}
    </>
  )
}

function useSaveSettings() {
  const { refresh } = useSettings()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)

  async function save(patch) {
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('settings').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', 1)
    setBusy(false)
    if (error) return setError(error)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    refresh()
  }
  return { save, busy, error, saved }
}

function ChurchProfile() {
  const { settings, refresh } = useSettings()
  const { save, busy, error, saved } = useSaveSettings()
  const [form, setForm] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => { if (settings) setForm(settings) }, [settings])
  if (!form) return null
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function uploadLogo(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    setUploadError(null)
    const path = `logo-${Date.now()}.${file.name.split('.').pop()}`
    const { error } = await supabase.storage.from('church').upload(path, file, { upsert: true, cacheControl: '3600' })
    if (error) {
      setUploading(false)
      return setUploadError('Upload failed. Make sure the "church" storage bucket exists (schema.sql creates it).')
    }
    const { data } = supabase.storage.from('church').getPublicUrl(path)
    await supabase.from('settings').update({ logo_url: data.publicUrl }).eq('id', 1)
    setForm((f) => ({ ...f, logo_url: data.publicUrl }))
    setUploading(false)
    refresh()
  }

  return (
    <Panel title="Church profile" action={saved && <span className="flex items-center gap-1 text-sm text-pew-600"><Check className="size-4" /> Saved</span>}>
      <ErrorNote error={error || uploadError} />
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const { id, updated_at, ...patch } = form
          save(patch)
        }}
        className="space-y-5"
      >
        <div className="flex flex-wrap items-center gap-4">
          {form.logo_url
            ? <img src={form.logo_url} alt="Church logo" className="size-20 rounded-lg border border-slate-200 bg-white object-contain p-1" />
            : <div className="grid size-20 place-items-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-400">No logo</div>}
          <div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={uploadLogo} />
            <Button type="button" variant="outline" loading={uploading} onClick={() => fileRef.current?.click()}>
              <Upload className="size-4" /> Upload logo
            </Button>
            <p className="mt-1 text-xs text-slate-500">Shown on the check-in page, printed reports and receipts.</p>
            {form.logo_url && (
              <button type="button" className="mt-1 text-xs text-absent underline" onClick={() => setForm((f) => ({ ...f, logo_url: null }))}>
                Remove logo
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Church name"><input required className={inputClass} value={form.church_name ?? ''} onChange={set('church_name')} /></Field>
          </div>
          <Field label="Denomination or assembly"><input className={inputClass} value={form.denomination ?? ''} onChange={set('denomination')} /></Field>
          <Field label="Motto"><input className={inputClass} value={form.motto ?? ''} onChange={set('motto')} /></Field>
          <Field label="Postal address"><input className={inputClass} value={form.address ?? ''} onChange={set('address')} /></Field>
          <Field label="Location or landmark"><input className={inputClass} value={form.location ?? ''} onChange={set('location')} /></Field>
          <Field label="City or town"><input className={inputClass} value={form.city ?? ''} onChange={set('city')} /></Field>
          <Field label="Country"><input className={inputClass} value={form.country ?? ''} onChange={set('country')} /></Field>
          <Field label="Phone"><input className={inputClass} value={form.phone ?? ''} onChange={set('phone')} /></Field>
          <Field label="Email"><input type="email" className={inputClass} value={form.email ?? ''} onChange={set('email')} /></Field>
          <Field label="Website"><input className={inputClass} value={form.website ?? ''} onChange={set('website')} /></Field>
          <Field label="Currency symbol" hint="Used on every money figure"><input className={inputClass} value={form.currency_symbol ?? ''} onChange={set('currency_symbol')} /></Field>
          <Field label="Currency code"><input className={inputClass} value={form.currency_code ?? ''} onChange={set('currency_code')} /></Field>
          <Field label="Phone country code" hint="233 for Ghana. Used when sending SMS.">
            <input className={inputClass} value={form.country_dial_code ?? ''} onChange={set('country_dial_code')} />
          </Field>
          <Field label="Follow-up after this many missed services">
            <input type="number" min="1" max="12" className={inputClass} value={form.follow_up_threshold ?? 3}
              onChange={(e) => setForm((f) => ({ ...f, follow_up_threshold: Number(e.target.value) }))} />
          </Field>
        </div>

        <Button type="submit" loading={busy}>Save profile</Button>
      </form>
    </Panel>
  )
}

function SmsSettings() {
  const { settings } = useSettings()
  const { save, busy, error, saved } = useSaveSettings()
  const [form, setForm] = useState(null)
  const [showSecret, setShowSecret] = useState(false)

  useEffect(() => { if (settings) setForm(settings) }, [settings])
  if (!form) return null
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Panel title="SMS provider" className="lg:col-span-2"
        action={saved && <span className="flex items-center gap-1 text-sm text-pew-600"><Check className="size-4" /> Saved</span>}>
        <ErrorNote error={error} />
        <form
          onSubmit={(e) => {
            e.preventDefault()
            save({
              sms_enabled: form.sms_enabled,
              sms_provider: form.sms_provider,
              sms_client_id: form.sms_client_id,
              sms_client_secret: form.sms_client_secret,
              sms_sender_id: form.sms_sender_id,
            })
          }}
          className="space-y-4"
        >
          <Field label="Provider">
            <Select allowEmpty={false} value={form.sms_provider ?? 'hubtel'} onChange={set('sms_provider')}
              options={[{ value: 'hubtel', label: 'Hubtel' }]} />
          </Field>
          <Field label="Client ID">
            <input className={inputClass} value={form.sms_client_id ?? ''} onChange={set('sms_client_id')} autoComplete="off" />
          </Field>
          <Field label="Client Secret">
            <div className="relative">
              <input type={showSecret ? 'text' : 'password'} className={`${inputClass} pr-10`} value={form.sms_client_secret ?? ''} onChange={set('sms_client_secret')} autoComplete="off" />
              <button type="button" onClick={() => setShowSecret((s) => !s)}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1.5 text-slate-500 hover:bg-slate-100"
                aria-label={showSecret ? 'Hide secret' : 'Show secret'}>
                {showSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </Field>
          <Field label="Sender ID" hint="Up to 11 letters or numbers, approved by your provider">
            <input maxLength={11} className={inputClass} value={form.sms_sender_id ?? ''} onChange={set('sms_sender_id')} placeholder="MYCHURCH" />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!form.sms_enabled} onChange={set('sms_enabled')} className="size-4 accent-pew-600" />
            SMS sending is on
          </label>
          <Button type="submit" loading={busy}>Save SMS settings</Button>
        </form>
      </Panel>

      <Panel title="How it works">
        <ol className="list-decimal space-y-2 pl-4 text-sm text-slate-600">
          <li>Get your Client ID and Client Secret from your Hubtel dashboard, under API keys.</li>
          <li>Request a Sender ID there too. Providers must approve it before messages go out.</li>
          <li>Paste all three here and switch SMS on.</li>
          <li>Send a test from the SMS page before your first bulk send.</li>
        </ol>
        <p className="mt-4 text-sm text-slate-600">
          Your credentials stay in the database and are only read by the send-sms function on the server. They are never
          exposed to members or to anyone's browser.
        </p>
      </Panel>
    </div>
  )
}

function Groups() {
  const { groups, refresh } = useSettings()
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState(null)

  async function remove(g) {
    if (!confirm(`Delete ${g.name}? Members in it will have no group until you reassign them.`)) return
    const { error } = await supabase.from('groups').delete().eq('id', g.id)
    if (error) setError(error)
    else refresh()
  }

  return (
    <Panel title="Groups" action={<Button size="sm" onClick={() => setEditing({ name: '', leader_name: '', leader_phone: '', description: '', is_active: true })}><Plus className="size-4" /> New group</Button>}>
      <ErrorNote error={error} />
      {groups.length === 0 ? <Empty title="No groups yet">Create the groups your members belong to.</Empty> : (
        <ul className="divide-y divide-slate-100">
          {groups.map((g) => (
            <li key={g.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{g.name} {!g.is_active && <Badge>Off</Badge>}</p>
                <p className="text-sm text-slate-500">
                  {[g.leader_name, g.leader_phone, g.description].filter(Boolean).join(' · ') || 'No leader set'}
                </p>
              </div>
              <button className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => setEditing(g)} aria-label="Edit"><Pencil className="size-4" /></button>
              <button className="rounded-md p-1.5 text-absent hover:bg-absent/10" onClick={() => remove(g)} aria-label="Delete"><Trash2 className="size-4" /></button>
            </li>
          ))}
        </ul>
      )}
      <GroupModal group={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh() }} />
    </Panel>
  )
}

function GroupModal({ group, onClose, onSaved }) {
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!group) return setForm(null)
    setForm({
      name: group.name ?? '', leader_name: group.leader_name ?? '', leader_phone: group.leader_phone ?? '',
      description: group.description ?? '', is_active: group.is_active ?? true,
    })
    setError(null)
  }, [group])

  if (!group || !form) return null
  const isNew = !group.id
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const payload = { ...form, leader_name: form.leader_name || null, leader_phone: form.leader_phone || null, description: form.description || null }
    const { error } = isNew
      ? await supabase.from('groups').insert(payload)
      : await supabase.from('groups').update(payload).eq('id', group.id)
    setBusy(false)
    if (error) setError(error.message?.includes('duplicate') ? 'A group with that name already exists.' : error)
    else onSaved()
  }

  return (
    <Modal open onClose={onClose} title={isNew ? 'New group' : 'Edit group'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" form="group-form" loading={busy}>Save group</Button></>}>
      <form id="group-form" onSubmit={submit} className="space-y-4">
        <ErrorNote error={error} />
        <Field label="Group name"><input required autoFocus className={inputClass} value={form.name} onChange={set('name')} placeholder="Group 1" /></Field>
        <Field label="Group leader"><input className={inputClass} value={form.leader_name} onChange={set('leader_name')} /></Field>
        <Field label="Leader's phone"><input className={inputClass} value={form.leader_phone} onChange={set('leader_phone')} /></Field>
        <Field label="Description"><input className={inputClass} value={form.description} onChange={set('description')} /></Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.is_active} onChange={set('is_active')} className="size-4 accent-pew-600" />
          Active (can be chosen when adding a member)
        </label>
      </form>
    </Modal>
  )
}

function ContributionTypes() {
  const { contributionTypes, accounts, refresh } = useSettings()
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState(null)
  const accountLabel = (id) => {
    const a = accounts.find((x) => x.id === id)
    return a ? `${a.code} — ${a.name}` : 'Not linked'
  }

  async function remove(t) {
    if (!confirm(`Delete "${t.name}"? Types already used by payments cannot be deleted; switch them off instead.`)) return
    const { error } = await supabase.from('contribution_types').delete().eq('id', t.id)
    if (error) setError('This type is used by existing payments, so it cannot be deleted. Switch it off instead.')
    else refresh()
  }

  return (
    <Panel
      title="Payment types"
      action={<Button size="sm" onClick={() => setEditing({ name: '', per_member: true, is_active: true, sort_order: contributionTypes.length + 1 })}><Plus className="size-4" /> New type</Button>}
    >
      <ErrorNote error={error} />
      <p className="mb-4 text-sm text-slate-600">
        Each type is linked to the income account it credits and the cash account it lands in, so recording a payment updates the books automatically.
      </p>
      <ul className="divide-y divide-slate-100">
        {contributionTypes.map((t) => (
          <li key={t.id} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {t.name} {!t.is_active && <Badge>Off</Badge>} {t.per_member ? <Badge tone="green">Per member</Badge> : <Badge tone="brass">General</Badge>}
              </p>
              <p className="text-sm text-slate-500">
                Credits {accountLabel(t.income_account_id)} · Into {accountLabel(t.default_cash_account_id)}
              </p>
            </div>
            <button className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => setEditing(t)} aria-label="Edit"><Pencil className="size-4" /></button>
            <button className="rounded-md p-1.5 text-absent hover:bg-absent/10" onClick={() => remove(t)} aria-label="Delete"><Trash2 className="size-4" /></button>
          </li>
        ))}
      </ul>
      <TypeModal type={editing} accounts={accounts} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh() }} />
    </Panel>
  )
}

function TypeModal({ type, accounts, onClose, onSaved }) {
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!type) return setForm(null)
    setForm({
      name: type.name ?? '',
      income_account_id: type.income_account_id ?? '',
      default_cash_account_id: type.default_cash_account_id ?? '',
      per_member: type.per_member ?? true,
      is_active: type.is_active ?? true,
      sort_order: type.sort_order ?? 0,
    })
    setError(null)
  }, [type])

  if (!type || !form) return null
  const isNew = !type.id
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const payload = {
      ...form,
      income_account_id: form.income_account_id || null,
      default_cash_account_id: form.default_cash_account_id || null,
      sort_order: Number(form.sort_order) || 0,
    }
    const { error } = isNew
      ? await supabase.from('contribution_types').insert(payload)
      : await supabase.from('contribution_types').update(payload).eq('id', type.id)
    setBusy(false)
    if (error) setError(error)
    else onSaved()
  }

  return (
    <Modal open onClose={onClose} title={isNew ? 'New payment type' : 'Edit payment type'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" form="type-form" loading={busy}>Save type</Button></>}>
      <form id="type-form" onSubmit={submit} className="space-y-4">
        <ErrorNote error={error} />
        <Field label="Name"><input required autoFocus className={inputClass} value={form.name} onChange={set('name')} placeholder="Building Fund" /></Field>
        <Field label="Income account it credits">
          <Select value={form.income_account_id} onChange={set('income_account_id')} placeholder="Choose an income account"
            options={accounts.filter((a) => a.type === 'Income').map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))} />
        </Field>
        <Field label="Money goes into">
          <Select value={form.default_cash_account_id} onChange={set('default_cash_account_id')} placeholder="Choose a cash or bank account"
            options={accounts.filter((a) => a.is_cash).map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.per_member} onChange={set('per_member')} className="size-4 accent-pew-600" />
          Recorded against a specific member (tithes, welfare, special contributions)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.is_active} onChange={set('is_active')} className="size-4 accent-pew-600" />
          Active
        </label>
      </form>
    </Modal>
  )
}

function Dropdowns() {
  const { lookups, refresh } = useSettings()
  const [category, setCategory] = useState(LOOKUP_CATEGORIES[0].key)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const rows = lookups.filter((l) => l.category === category)

  async function add(e) {
    e.preventDefault()
    if (!value.trim()) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('lookups').insert({ category, value: value.trim(), sort_order: rows.length + 1 })
    setBusy(false)
    if (error) setError(error.message?.includes('duplicate') ? 'That option already exists.' : error)
    else { setValue(''); refresh() }
  }

  async function toggle(row) {
    await supabase.from('lookups').update({ is_active: !row.is_active }).eq('id', row.id)
    refresh()
  }

  async function remove(row) {
    if (!confirm(`Remove "${row.value}"? Members already using it keep the value.`)) return
    await supabase.from('lookups').delete().eq('id', row.id)
    refresh()
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Panel title="Choose a dropdown">
        <ul className="space-y-1">
          {LOOKUP_CATEGORIES.map((c) => (
            <li key={c.key}>
              <button
                onClick={() => setCategory(c.key)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium ${category === c.key ? 'bg-pew-50 text-pew-700' : 'hover:bg-slate-50'}`}
              >
                {c.label}
                <span className="float-right text-xs text-slate-400">{lookups.filter((l) => l.category === c.key).length}</span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title={LOOKUP_CATEGORIES.find((c) => c.key === category)?.label} className="lg:col-span-2">
        <ErrorNote error={error} />
        <form onSubmit={add} className="mb-4 flex gap-2">
          <input className={inputClass} value={value} onChange={(e) => setValue(e.target.value)} placeholder="Add an option" />
          <Button type="submit" loading={busy}><Plus className="size-4" /> Add</Button>
        </form>
        {rows.length === 0 ? <Empty title="No options yet">Add the first one above.</Empty> : (
          <ul className="divide-y divide-slate-100">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center gap-3 py-2.5">
                <span className={`flex-1 text-sm ${row.is_active ? '' : 'text-slate-400 line-through'}`}>{row.value}</span>
                <button onClick={() => toggle(row)} className="text-xs font-medium text-pew-600 hover:underline">
                  {row.is_active ? 'Switch off' : 'Switch on'}
                </button>
                <button className="rounded-md p-1.5 text-absent hover:bg-absent/10" onClick={() => remove(row)} aria-label="Remove"><Trash2 className="size-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
