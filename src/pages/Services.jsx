import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { Plus, QrCode, FileText, Lock, Unlock, Trash2, Copy, Printer, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSettings } from '../context/SettingsContext'
import { formatDate, toISODate } from '../lib/utils'
import { Badge, Button, Empty, ErrorNote, Field, PageHeader, Select, Spinner, inputClass } from '../components/ui'
import Modal from '../components/Modal'

export default function Services() {
  const { lookup } = useSettings()
  const [services, setServices] = useState([])
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [creating, setCreating] = useState(false)
  const [qrFor, setQrFor] = useState(null)

  async function load() {
    const { data, error } = await supabase
      .from('services').select('*, attendance(count)')
      .order('service_date', { ascending: false }).order('created_at', { ascending: false }).limit(80)
    if (error) setError(error)
    else {
      setServices(data)
      setCounts(Object.fromEntries(data.map((s) => [s.id, s.attendance?.[0]?.count ?? 0])))
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function toggleOpen(s) {
    const { error } = await supabase.from('services').update({ is_open: !s.is_open }).eq('id', s.id)
    if (error) setError(error)
    else setServices((list) => list.map((x) => (x.id === s.id ? { ...x, is_open: !s.is_open } : x)))
  }

  async function remove(s) {
    if (!confirm(`Delete "${s.title}" on ${formatDate(s.service_date)}? Its attendance records will go too.`)) return
    const { error } = await supabase.from('services').delete().eq('id', s.id)
    if (error) setError(error)
    else setServices((list) => list.filter((x) => x.id !== s.id))
  }

  return (
    <>
      <PageHeader
        title="Services"
        subtitle="Open a service to let members check in, then close it when the service ends."
        actions={
          <>
            <Button variant="outline" onClick={() => setQrFor('permanent')}><QrCode className="size-4" /> Entrance QR code</Button>
            <Button onClick={() => setCreating(true)}><Plus className="size-4" /> New service</Button>
          </>
        }
      />
      <ErrorNote error={error} />

      {loading ? <Spinner /> : services.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white">
          <Empty title="No services yet">Create today’s service to generate a check-in QR code.</Empty>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <ul className="divide-y divide-slate-100">
            {services.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="w-16 shrink-0 text-center">
                  <p className="font-display text-2xl leading-none">{formatDate(s.service_date, { day: 'numeric' })}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatDate(s.service_date, { month: 'short', year: '2-digit' })}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{s.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                    <span>{s.service_type}</span>
                    {s.is_open ? <Badge tone="green">Check-in open</Badge> : <Badge>Closed</Badge>}
                    <span>{counts[s.id] ?? 0} present</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {s.is_open && <Button size="sm" variant="brass" onClick={() => setQrFor(s)}><QrCode className="size-4" /> QR code</Button>}
                  <Button size="sm" variant="outline" onClick={() => toggleOpen(s)}>
                    {s.is_open ? <Lock className="size-4" /> : <Unlock className="size-4" />}{s.is_open ? 'Close' : 'Reopen'}
                  </Button>
                  <Link to={`/reports/${s.id}`}><Button size="sm" variant="outline"><FileText className="size-4" /> Report</Button></Link>
                  <Button size="sm" variant="ghost" onClick={() => remove(s)} aria-label="Delete service"><Trash2 className="size-4 text-absent" /></Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <NewServiceModal
        open={creating}
        types={lookup('service_type')}
        onClose={() => setCreating(false)}
        onCreated={(s) => { setCreating(false); setServices((list) => [s, ...list]); setQrFor(s) }}
      />
      <QrModal target={qrFor} onClose={() => setQrFor(null)} />
    </>
  )
}

function NewServiceModal({ open, types, onClose, onCreated }) {
  const first = types[0] ?? 'Sunday Service'
  const [form, setForm] = useState({ title: first, service_type: first, service_date: toISODate(new Date()) })
  const [closeOthers, setCloseOthers] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    if (closeOthers) await supabase.from('services').update({ is_open: false }).eq('is_open', true)
    const { data, error } = await supabase.from('services').insert({ ...form, is_open: true }).select().single()
    setBusy(false)
    if (error) setError(error)
    else onCreated(data)
  }

  return (
    <Modal open={open} onClose={onClose} title="New service"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" form="new-service" loading={busy}>Create and open check-in</Button></>}>
      <form id="new-service" onSubmit={submit} className="space-y-4">
        <ErrorNote error={error} />
        <Field label="Service type">
          <Select allowEmpty={false} value={form.service_type} options={types}
            onChange={(e) => setForm((f) => ({ ...f, service_type: e.target.value, title: e.target.value }))} />
        </Field>
        <Field label="Title" hint="Shown to members on the check-in page">
          <input required className={inputClass} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        </Field>
        <Field label="Date">
          <input type="date" required className={inputClass} value={form.service_date} onChange={(e) => setForm((f) => ({ ...f, service_date: e.target.value }))} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={closeOthers} onChange={(e) => setCloseOthers(e.target.checked)} className="size-4 accent-pew-600" />
          Close check-in for other open services
        </label>
      </form>
    </Modal>
  )
}

function QrModal({ target, onClose }) {
  const { settings } = useSettings()
  const [copied, setCopied] = useState(false)
  const printRef = useRef(null)
  if (!target) return null

  const permanent = target === 'permanent'
  const url = `${window.location.origin}/checkin${permanent ? '' : `/${target.id}`}`

  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ }
  }

  function printQr() {
    const w = window.open('', '_blank', 'width=600,height=800')
    if (!w) return
    w.document.write(`<!doctype html><html><head><title>Check-in QR</title>
      <style>body{font-family:Georgia,serif;text-align:center;padding:48px;color:#1f2a44}
      h1{font-size:32px;margin:0 0 8px}p{font-size:18px;margin:4px 0}svg{width:360px;height:360px;margin:32px auto}
      img{max-height:90px;margin-bottom:12px}</style></head><body>${printRef.current.innerHTML}</body></html>`)
    w.document.close()
    w.focus()
    w.print()
  }

  return (
    <Modal open onClose={onClose} title={permanent ? 'Entrance QR code' : 'Check-in QR code'}
      footer={<>
        <Button variant="outline" onClick={copy}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? 'Copied' : 'Copy link'}</Button>
        <Button onClick={printQr}><Printer className="size-4" /> Print</Button>
      </>}>
      <div ref={printRef} className="text-center">
        {settings?.logo_url && <img src={settings.logo_url} alt="" className="mx-auto mb-2 max-h-16 object-contain" />}
        <h1 className="font-display text-2xl">{settings?.church_name}</h1>
        <p className="text-slate-600">{permanent ? 'Scan to mark your attendance' : `${target.title}, ${formatDate(target.service_date)}`}</p>
        <div className="mx-auto my-5 w-fit rounded-xl border border-slate-200 bg-white p-4">
          <QRCodeSVG value={url} size={240} level="M" fgColor="#15302a" />
        </div>
        <p>Scan with your phone camera, find your name and tap Check in.</p>
      </div>
      <p className="mt-4 break-all rounded-lg bg-paper px-3 py-2 text-center text-xs text-slate-500">{url}</p>
      {permanent && (
        <p className="mt-3 text-sm text-slate-600">
          This code never changes. It always opens the most recent open service, so you can print it once and keep it at the entrance.
        </p>
      )}
    </Modal>
  )
}
