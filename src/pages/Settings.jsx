import { useCallback, useEffect, useRef, useState } from 'react'
import { Upload, Plus, Trash2, Pencil, Check, Eye, EyeOff, RefreshCw, Copy } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSettings } from '../context/SettingsContext'
import { LOOKUP_CATEGORIES, PERMISSIONS, SMS_PLACEHOLDERS } from '../lib/constants'
import {
  Badge, Button, Empty, ErrorNote, Field, PageHeader, Panel, Select, Spinner, Tabs, inputClass,
} from '../components/ui'
import Modal from '../components/Modal'
import PhotoUpload from '../components/PhotoUpload'

const ALL_TABS = [
  { key: 'church', label: 'Church profile', need: 'settings.manage' },
  { key: 'sms', label: 'SMS', need: 'settings.manage' },
  { key: 'automatic', label: 'Automatic messages', need: 'settings.manage' },
  { key: 'groups', label: 'Groups', need: 'settings.manage' },
  { key: 'contributions', label: 'Payment types', need: 'finance.manage' },
  { key: 'users', label: 'Users and roles', need: 'users.manage' },
  { key: 'dropdowns', label: 'Dropdowns', need: 'settings.manage' },
  { key: 'me', label: 'My profile' },
]

export default function Settings() {
  const { can } = useSettings()
  const tabs = ALL_TABS.filter((t) => !t.need || can(t.need))
  const [tab, setTab] = useState(tabs[0]?.key ?? 'me')

  return (
    <>
      <PageHeader title="Settings" subtitle="Set this up once and the whole system follows it." />
      <div className="mb-6"><Tabs value={tab} onChange={setTab} options={tabs} /></div>
      {tab === 'church' && <ChurchProfile />}
      {tab === 'sms' && <SmsSettings />}
      {tab === 'automatic' && <AutomaticMessages />}
      {tab === 'groups' && <Groups />}
      {tab === 'contributions' && <ContributionTypes />}
      {tab === 'users' && <UsersAndRoles />}
      {tab === 'dropdowns' && <Dropdowns />}
      {tab === 'me' && <MyProfile />}
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

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!form.show_photos_on_checkin}
            onChange={(e) => setForm((f) => ({ ...f, show_photos_on_checkin: e.target.checked }))}
            className="size-4 accent-pew-600" />
          Show member photos on the public check-in page (easier to find your name, but anyone with the link sees them)
        </label>

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
              <p className="flex flex-wrap items-center gap-1.5 font-medium">
                {t.name} {!t.is_active && <Badge>Off</Badge>}
                {t.per_member ? <Badge tone="green">Per member</Badge> : <Badge tone="brass">General</Badge>}
                {t.is_billable && <Badge tone="red">Billed</Badge>}
                {t.kind === 'special' && <Badge tone="brass">Special</Badge>}
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
      receivable_account_id: type.receivable_account_id ?? '',
      per_member: type.per_member ?? true,
      is_billable: type.is_billable ?? false,
      default_amount: type.default_amount ?? '',
      kind: type.kind ?? 'general',
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
      receivable_account_id: form.is_billable ? form.receivable_account_id || null : null,
      default_amount: form.default_amount === '' ? null : Number(form.default_amount),
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
          <input type="checkbox" checked={form.is_billable} onChange={set('is_billable')} className="size-4 accent-pew-600" />
          Members are billed for this, so balances and defaulters are tracked
        </label>
        {form.is_billable && (
          <div className="grid gap-4 rounded-lg border border-slate-200 p-4 sm:grid-cols-2">
            <Field label="Receivable account" hint="Where what members owe is held until they pay">
              <Select value={form.receivable_account_id} onChange={set('receivable_account_id')} placeholder="Choose an account"
                options={accounts.filter((a) => a.type === 'Asset' && !a.is_cash).map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))} />
            </Field>
            <Field label="Usual amount" hint="Suggested when you run a billing batch">
              <input type="number" step="0.01" min="0" className={inputClass} value={form.default_amount ?? ''} onChange={set('default_amount')} />
            </Field>
          </div>
        )}
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

function AutomaticMessages() {
  const { settings } = useSettings()
  const { save, busy, error, saved } = useSaveSettings()
  const [form, setForm] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => { if (settings) setForm(settings) }, [settings])
  if (!form) return null
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  function newSecret() {
    const secret = Array.from(crypto.getRandomValues(new Uint8Array(18)))
      .map((b) => b.toString(16).padStart(2, '0')).join('')
    setForm((f) => ({ ...f, cron_secret: secret }))
  }

  return (
    <div className="space-y-6">
      <Panel title="Messages the system sends on its own"
        action={saved && <span className="flex items-center gap-1 text-sm text-pew-600"><Check className="size-4" /> Saved</span>}>
        <ErrorNote error={error} />
        <form
          onSubmit={(e) => {
            e.preventDefault()
            save({
              sms_on_payment: form.sms_on_payment,
              sms_payment_template: form.sms_payment_template,
              sms_on_billing: form.sms_on_billing,
              sms_billing_template: form.sms_billing_template,
              sms_birthday_enabled: form.sms_birthday_enabled,
              sms_birthday_template: form.sms_birthday_template,
              cron_secret: form.cron_secret,
            })
          }}
          className="space-y-6"
        >
          <section>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={!!form.sms_on_payment} onChange={set('sms_on_payment')} className="size-4 accent-pew-600" />
              Text a member their receipt and balance after every payment
            </label>
            <textarea rows={3} className={`${inputClass} mt-2`} value={form.sms_payment_template ?? ''} onChange={set('sms_payment_template')} />
            <Placeholders list={SMS_PLACEHOLDERS.payment} />
          </section>

          <section>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={!!form.sms_birthday_enabled} onChange={set('sms_birthday_enabled')} className="size-4 accent-pew-600" />
              Send birthday wishes
            </label>
            <textarea rows={3} className={`${inputClass} mt-2`} value={form.sms_birthday_template ?? ''} onChange={set('sms_birthday_template')} />
            <Placeholders list={SMS_PLACEHOLDERS.birthday} />
          </section>

          <section>
            <p className="text-sm font-medium">Balance reminder wording</p>
            <p className="text-sm text-slate-600">Used when you text defaulters from the billing page.</p>
            <textarea rows={3} className={`${inputClass} mt-2`} value={form.sms_billing_template ?? ''} onChange={set('sms_billing_template')} />
            <Placeholders list={SMS_PLACEHOLDERS.billing} />
          </section>

          <Button type="submit" loading={busy}>Save</Button>
        </form>
      </Panel>

      <Panel title="Let Supabase send birthday wishes every morning">
        <p className="text-sm text-slate-600">
          Birthday wishes can always be sent by hand from the Birthdays page. To have them go out on their own,
          generate a secret here, then run <code className="rounded bg-slate-100 px-1">supabase/schedule-birthdays.sql</code>{' '}
          in your Supabase SQL editor after pasting the secret into it.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input readOnly className={`${inputClass} max-w-sm font-mono text-xs`} value={form.cron_secret ?? 'No secret yet'} />
          <Button type="button" variant="outline" onClick={newSecret}><RefreshCw className="size-4" /> Generate</Button>
          {form.cron_secret && (
            <Button type="button" variant="ghost" onClick={async () => {
              await navigator.clipboard.writeText(form.cron_secret)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? 'Copied' : 'Copy'}
            </Button>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500">Generate, then press Save above before using it.</p>
      </Panel>
    </div>
  )
}

function Placeholders({ list }) {
  return (
    <p className="mt-1 flex flex-wrap gap-1.5 text-xs text-slate-500">
      {list.map((p) => <code key={p} className="rounded bg-slate-100 px-1">{p}</code>)}
    </p>
  )
}

function UsersAndRoles() {
  const { groups, lookup, refresh } = useSettings()
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [editingUser, setEditingUser] = useState(null)
  const [editingRole, setEditingRole] = useState(null)

  const load = useCallback(async () => {
    try {
      const [u, r] = await Promise.all([
        supabase.from('admins').select('*').order('full_name'),
        supabase.from('roles').select('*').order('name'),
      ])
      if (u.error || r.error) setError(u.error ?? r.error)
      setUsers(u.data ?? [])
      setRoles(r.data ?? [])
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function removeUser(u) {
    if (!confirm(`Remove ${u.full_name || u.email}? They will no longer be able to sign in.`)) return
    const { data, error } = await supabase.functions.invoke('manage-users', { body: { action: 'delete', user_id: u.user_id } })
    if (error || data?.error) setError(data?.error || 'Could not remove that user. Is the manage-users function deployed?')
    else { setNotice('User removed.'); load() }
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-6">
      <ErrorNote error={error} />
      {notice && <div className="rounded-lg border border-pew-200 bg-pew-50 px-4 py-3 text-sm text-pew-700">{notice}</div>}

      <Panel title="People who can sign in"
        action={<Button size="sm" onClick={() => setEditingUser({})}><Plus className="size-4" /> Add user</Button>}>
        <ul className="divide-y divide-slate-100">
          {users.map((u) => (
            <li key={u.user_id} className="flex items-center gap-3 py-3">
              {u.photo_url
                ? <img src={u.photo_url} alt="" className="size-9 rounded-full object-cover" />
                : <span className="grid size-9 place-items-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
                    {(u.full_name || u.email || '?').charAt(0).toUpperCase()}
                  </span>}
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {u.full_name || u.email} {!u.is_active && <Badge>Suspended</Badge>}
                </p>
                <p className="truncate text-sm text-slate-500">
                  {[roles.find((r) => r.id === u.role_id)?.name ?? 'No role', u.email,
                    groups.find((g) => g.id === u.group_id)?.name, u.ministry].filter(Boolean).join(' · ')}
                </p>
              </div>
              <button className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => setEditingUser(u)} aria-label="Edit"><Pencil className="size-4" /></button>
              <button className="rounded-md p-1.5 text-absent hover:bg-absent/10" onClick={() => removeUser(u)} aria-label="Remove"><Trash2 className="size-4" /></button>
            </li>
          ))}
          {!users.length && <li><Empty title="No users yet" /></li>}
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          Adding a user creates their login straight away. This needs the <code className="rounded bg-slate-100 px-1">manage-users</code> function deployed in Supabase.
        </p>
      </Panel>

      <Panel title="Roles and what they may do"
        action={<Button size="sm" variant="outline" onClick={() => setEditingRole({ name: '', description: '', permissions: [] })}>
          <Plus className="size-4" /> New role
        </Button>}>
        <ul className="divide-y divide-slate-100">
          {roles.map((r) => (
            <li key={r.id} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{r.name} {r.is_system && <Badge>Built in</Badge>}</p>
                <p className="text-sm text-slate-500">{r.description}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {r.name === 'Administrator'
                    ? 'Everything, always'
                    : (r.permissions ?? []).map((p) => PERMISSIONS.find((x) => x.key === p)?.label ?? p).join(', ') || 'Nothing yet'}
                </p>
              </div>
              <button className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => setEditingRole(r)} aria-label="Edit"><Pencil className="size-4" /></button>
              {!r.is_system && (
                <button className="rounded-md p-1.5 text-absent hover:bg-absent/10"
                  onClick={async () => {
                    if (!confirm(`Delete the ${r.name} role?`)) return
                    await supabase.from('roles').delete().eq('id', r.id)
                    load()
                  }} aria-label="Delete"><Trash2 className="size-4" /></button>
              )}
            </li>
          ))}
        </ul>
      </Panel>

      <UserModal user={editingUser} roles={roles} groups={groups} ministries={lookup('ministry')}
        onClose={() => setEditingUser(null)}
        onSaved={(msg) => { setEditingUser(null); setNotice(msg); load(); refresh() }} />

      <RoleModal role={editingRole} onClose={() => setEditingRole(null)}
        onSaved={() => { setEditingRole(null); load(); refresh() }} />
    </div>
  )
}

function UserModal({ user, roles, groups, ministries, onClose, onSaved }) {
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!user) return setForm(null)
    setForm({
      full_name: user.full_name ?? '', email: user.email ?? '', phone: user.phone ?? '',
      password: '', role_id: user.role_id ?? '', group_id: user.group_id ?? '',
      ministry: user.ministry ?? '', is_active: user.is_active ?? true,
    })
    setError(null)
  }, [user])

  if (!user || !form) return null
  const isNew = !user.user_id
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const role = roles.find((r) => r.id === form.role_id)

  async function submit(e) {
    e.preventDefault()
    if (!form.role_id) return setError('Choose a role for this person.')
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.functions.invoke('manage-users', {
      body: {
        action: isNew ? 'create' : 'update',
        user_id: user.user_id,
        full_name: form.full_name,
        email: form.email,
        phone: form.phone || null,
        password: form.password || undefined,
        role_id: form.role_id,
        group_id: form.group_id || null,
        ministry: form.ministry || null,
        is_active: form.is_active,
      },
    })
    setBusy(false)
    if (error || data?.error) {
      setError(data?.error || 'Could not save. Check that the manage-users function is deployed in Supabase.')
    } else {
      onSaved(isNew ? `${form.full_name || form.email} can now sign in.` : 'User updated.')
    }
  }

  return (
    <Modal open onClose={onClose} title={isNew ? 'Add a user' : form.full_name || form.email}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" form="user-form" loading={busy}>{isNew ? 'Create login' : 'Save changes'}</Button></>}>
      <form id="user-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><ErrorNote error={error} /></div>
        <Field label="Full name"><input required className={inputClass} value={form.full_name} onChange={set('full_name')} /></Field>
        <Field label="Email"><input type="email" required className={inputClass} value={form.email} onChange={set('email')} /></Field>
        <Field label="Phone"><input className={inputClass} value={form.phone} onChange={set('phone')} /></Field>
        <Field label={isNew ? 'Temporary password' : 'New password (leave blank to keep)'}>
          <input type="text" required={isNew} minLength={8} className={inputClass} value={form.password} onChange={set('password')}
            placeholder="At least 8 characters" autoComplete="new-password" />
        </Field>
        <Field label="Role">
          <Select value={form.role_id} onChange={set('role_id')} placeholder="Choose a role"
            options={roles.map((r) => ({ value: r.id, label: r.name }))} />
        </Field>
        <Field label="Group" hint="For a group leader: the group they look after">
          <Select value={form.group_id} onChange={set('group_id')} placeholder="Not tied to a group"
            options={groups.map((g) => ({ value: g.id, label: g.name }))} />
        </Field>
        <Field label="Ministry" hint="For a ministry leader">
          <Select value={form.ministry} onChange={set('ministry')} placeholder="Not tied to a ministry" options={ministries} />
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={form.is_active} onChange={set('is_active')} className="size-4 accent-pew-600" />
          Active (can sign in)
        </label>
        {role && role.name !== 'Administrator' && (
          <p className="rounded-lg bg-paper px-3 py-2 text-xs text-slate-600 sm:col-span-2">
            {role.name} may: {(role.permissions ?? []).map((p) => PERMISSIONS.find((x) => x.key === p)?.label ?? p).join(', ') || 'nothing yet'}.
            {!(role.permissions ?? []).includes('members.view_all') && ' They will only see members of their own group or ministry.'}
          </p>
        )}
      </form>
    </Modal>
  )
}

function RoleModal({ role, onClose, onSaved }) {
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!role) return setForm(null)
    setForm({ name: role.name ?? '', description: role.description ?? '', permissions: role.permissions ?? [] })
    setError(null)
  }, [role])

  if (!role || !form) return null
  const isNew = !role.id
  const locked = role.name === 'Administrator'

  function toggle(key) {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(key) ? f.permissions.filter((p) => p !== key) : [...f.permissions, key],
    }))
  }

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const payload = { name: form.name.trim(), description: form.description || null, permissions: form.permissions }
    const { error } = isNew
      ? await supabase.from('roles').insert(payload)
      : await supabase.from('roles').update(payload).eq('id', role.id)
    setBusy(false)
    if (error) setError(error.message?.includes('duplicate') ? 'A role with that name already exists.' : error)
    else onSaved()
  }

  return (
    <Modal open onClose={onClose} size="lg" title={isNew ? 'New role' : `Rights for ${role.name}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" form="role-form" loading={busy} disabled={locked}>Save role</Button></>}>
      <form id="role-form" onSubmit={submit} className="space-y-4">
        <ErrorNote error={error} />
        {locked && <p className="rounded-lg bg-paper px-3 py-2 text-sm">The Administrator role always has every right, so it cannot be limited.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Role name"><input required className={inputClass} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} disabled={role.is_system} /></Field>
          <Field label="Description"><input className={inputClass} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></Field>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">What this role may do</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {PERMISSIONS.map((p) => (
              <label key={p.key} className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm">
                <input type="checkbox" disabled={locked} checked={locked || form.permissions.includes(p.key)}
                  onChange={() => toggle(p.key)} className="mt-0.5 size-4 accent-pew-600" />
                <span>
                  {p.label}
                  {p.hint && <span className="block text-xs text-slate-500">{p.hint}</span>}
                </span>
              </label>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  )
}

function MyProfile() {
  const { profile, refresh } = useSettings()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState({ full_name: '', phone: '', photo_url: null })
  const [password, setPassword] = useState('')

  useEffect(() => {
    if (profile) setForm({ full_name: profile.full_name ?? '', phone: profile.phone ?? '', photo_url: profile.photo_url ?? null })
  }, [profile])

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('admins')
      .update({ full_name: form.full_name, phone: form.phone || null, photo_url: form.photo_url })
      .eq('user_id', profile.user_id)
    if (!error && password) {
      const { error: e2 } = await supabase.auth.updateUser({ password })
      if (e2) { setBusy(false); return setError(e2.message) }
      setPassword('')
    }
    setBusy(false)
    if (error) setError(error)
    else { setSaved(true); setTimeout(() => setSaved(false), 2000); refresh() }
  }

  if (!profile?.user_id) {
    return (
      <Panel title="My profile">
        <p className="text-sm text-slate-600">
          Your profile lives in the database. Run the latest <code className="rounded bg-slate-100 px-1">supabase/schema.sql</code>{' '}
          in Supabase, then reload this page.
        </p>
      </Panel>
    )
  }

  return (
    <Panel title="My profile" action={saved && <span className="flex items-center gap-1 text-sm text-pew-600"><Check className="size-4" /> Saved</span>}>
      <ErrorNote error={error} />
      <form onSubmit={save} className="space-y-4">
        <PhotoUpload value={form.photo_url} name={form.full_name} folder="staff"
          onChange={(url) => setForm((f) => ({ ...f, photo_url: url }))} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name"><input className={inputClass} value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} /></Field>
          <Field label="Phone"><input className={inputClass} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></Field>
          <Field label="Role"><input readOnly className={`${inputClass} bg-slate-50`} value={profile.role ?? 'No role'} /></Field>
          <Field label="New password" hint="Leave blank to keep the one you have">
            <input type="password" minLength={8} className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
        </div>
        <Button type="submit" loading={busy}>Save</Button>
      </form>
    </Panel>
  )
}
