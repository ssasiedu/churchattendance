import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Send, Users, RefreshCw, AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { supabase, fetchAll } from '../lib/supabase'
import { useSettings } from '../context/SettingsContext'
import { SMS_AUDIENCES } from '../lib/constants'
import { smsParts, toInternational } from '../lib/format'
import { formatDate, formatTime } from '../lib/utils'
import { Badge, Button, Empty, ErrorNote, Field, PageHeader, Panel, Select, Spinner, inputClass } from '../components/ui'
import Modal from '../components/Modal'

const TEMPLATES = [
  { label: 'We missed you', text: 'Hello {name}, we missed you at {church} today. We pray all is well. God bless you.' },
  { label: 'Service reminder', text: 'Hello {name}, join us at {church} this Sunday. Service starts at 8:00am. God bless you.' },
  { label: 'Midweek invite', text: 'Hello {name}, midweek service is on Wednesday at 6:00pm at {church}. Come and be blessed.' },
]

export default function Sms() {
  const { settings, groups } = useSettings()
  const [params, setParams] = useSearchParams()
  const [audience, setAudience] = useState(params.get('audience') || 'all')
  const [serviceId, setServiceId] = useState(params.get('service') || '')
  const [groupId, setGroupId] = useState('')
  const [customNumbers, setCustomNumbers] = useState('')
  const [body, setBody] = useState('')
  const [members, setMembers] = useState([])
  const [services, setServices] = useState([])
  const [attendance, setAttendance] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [preview, setPreview] = useState(false)
  const [testOpen, setTestOpen] = useState(false)

  const loadHistory = useCallback(async () => {
    const { data } = await supabase.from('sms_messages').select('*').order('created_at', { ascending: false }).limit(25)
    setHistory(data ?? [])
  }, [])

  useEffect(() => {
    async function load() {
      try {
        const [mem, svc] = await Promise.all([
          fetchAll(() => supabase.from('members').select('id, full_name, phone, group_id, is_active, joined_on').order('full_name').order('id')),
          supabase.from('services').select('id, title, service_date, service_type, is_open').order('service_date', { ascending: false }).limit(60),
        ])
        setMembers(mem)
        setServices(svc.data ?? [])
        await loadHistory()
      } catch (e) {
        setError(e)
      }
      setLoading(false)
    }
    load()
  }, [loadHistory])

  // Attendance is only needed for the service-based audiences
  useEffect(() => {
    if (audience !== 'absent' && audience !== 'present' && audience !== 'followup') return
    async function load() {
      if (audience === 'followup') {
        const closed = services.slice(0, 12).map((s) => s.id)
        if (!closed.length) return setAttendance([])
        const rows = await fetchAll(() => supabase.from('attendance').select('service_id, member_id').in('service_id', closed).order('id'))
        setAttendance(rows)
      } else if (serviceId) {
        const rows = await fetchAll(() => supabase.from('attendance').select('service_id, member_id').eq('service_id', serviceId).order('id'))
        setAttendance(rows)
      }
    }
    load()
  }, [audience, serviceId, services])

  const service = services.find((s) => s.id === serviceId)

  const recipients = useMemo(() => {
    const active = members.filter((m) => m.is_active)
    const withPhone = (list) => list.filter((m) => toInternational(m.phone, settings?.country_dial_code))

    if (audience === 'custom') {
      return customNumbers
        .split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean)
        .map((phone, i) => ({ id: `custom-${i}`, full_name: '', phone }))
    }
    if (audience === 'group') return withPhone(active.filter((m) => m.group_id === groupId))
    if (audience === 'absent' && service) {
      const presentIds = new Set(attendance.filter((a) => a.service_id === serviceId).map((a) => a.member_id))
      return withPhone(active.filter((m) => !presentIds.has(m.id) && m.joined_on <= service.service_date))
    }
    if (audience === 'present' && service) {
      const presentIds = new Set(attendance.filter((a) => a.service_id === serviceId).map((a) => a.member_id))
      return withPhone(active.filter((m) => presentIds.has(m.id)))
    }
    if (audience === 'followup') {
      const recent = services.filter((s) => !s.is_open).slice(0, settings?.follow_up_threshold ?? 3)
      if (recent.length < (settings?.follow_up_threshold ?? 3)) return []
      const ids = new Set(attendance.filter((a) => recent.some((s) => s.id === a.service_id)).map((a) => a.member_id))
      return withPhone(active.filter((m) => !ids.has(m.id) && m.joined_on <= recent[recent.length - 1].service_date))
    }
    return withPhone(active)
  }, [audience, members, groupId, serviceId, service, attendance, services, customNumbers, settings])

  const parts = smsParts(body)
  const audienceLabel =
    audience === 'group' ? `Group: ${groups.find((g) => g.id === groupId)?.name ?? ''}`
    : audience === 'absent' ? `Absent — ${service?.title ?? ''} ${service ? formatDate(service.service_date) : ''}`
    : audience === 'present' ? `Present — ${service?.title ?? ''} ${service ? formatDate(service.service_date) : ''}`
    : SMS_AUDIENCES.find((a) => a.key === audience)?.label ?? audience

  function personalise(text, name) {
    return text
      .replaceAll('{name}', (name ?? '').split(' ')[0] || 'beloved')
      .replaceAll('{church}', settings?.church_name ?? 'church')
  }

  async function send() {
    setError(null)
    setPreview(false)
    if (!settings?.sms_enabled) return setError('Switch SMS on under Settings → SMS first.')
    if (!body.trim()) return setError('Write the message you want to send.')
    if (!recipients.length) return setError('No one in this audience has a usable phone number.')

    setSending(true)
    const { data: message, error: e1 } = await supabase.from('sms_messages').insert({
      body: body.trim(),
      audience,
      audience_label: audienceLabel,
      service_id: audience === 'absent' || audience === 'present' ? serviceId || null : null,
      group_id: audience === 'group' ? groupId || null : null,
      recipient_count: recipients.length,
    }).select().single()

    if (e1) {
      setSending(false)
      return setError(e1)
    }

    const rows = recipients.map((r) => ({
      message_id: message.id,
      member_id: String(r.id).startsWith('custom-') ? null : r.id,
      name: r.full_name || null,
      phone: r.phone,
    }))
    for (let i = 0; i < rows.length; i += 400) {
      const { error } = await supabase.from('sms_recipients').insert(rows.slice(i, i + 400))
      if (error) {
        setSending(false)
        return setError(error)
      }
    }

    const { data, error } = await supabase.functions.invoke('send-sms', { body: { message_id: message.id } })
    setSending(false)
    loadHistory()

    if (error || data?.error) {
      setError(data?.error || 'The message could not be sent. Check Settings → SMS, and that the send-sms function is deployed.')
      return
    }
    setResult({ sent: data.sent, failed: data.failed })
    setBody('')
  }

  if (loading) return <Spinner />

  return (
    <>
      <PageHeader
        title="Send SMS"
        subtitle="Write once, send to everyone in the audience you choose."
        actions={<Button variant="outline" onClick={() => setTestOpen(true)}>Send a test</Button>}
      />

      {!settings?.sms_enabled && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-brass-300 bg-brass-100/60 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-brass-700" />
          <p>
            SMS is switched off. Add your Client ID, Client Secret and Sender ID under{' '}
            <Link to="/settings" className="font-semibold underline">Settings → SMS</Link>, then turn it on.
          </p>
        </div>
      )}

      <ErrorNote error={error} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel title="Who receives it">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Audience">
                <Select allowEmpty={false} value={audience}
                  onChange={(e) => { setAudience(e.target.value); setParams({}, { replace: true }) }}
                  options={SMS_AUDIENCES.map((a) => ({ value: a.key, label: a.label }))} />
              </Field>

              {(audience === 'absent' || audience === 'present') && (
                <Field label="Service">
                  <Select value={serviceId} onChange={(e) => setServiceId(e.target.value)} placeholder="Choose a service"
                    options={services.map((s) => ({ value: s.id, label: `${formatDate(s.service_date)} — ${s.title}` }))} />
                </Field>
              )}

              {audience === 'group' && (
                <Field label="Group">
                  <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} placeholder="Choose a group"
                    options={groups.map((g) => ({ value: g.id, label: g.name }))} />
                </Field>
              )}

              {audience === 'custom' && (
                <div className="sm:col-span-2">
                  <Field label="Phone numbers" hint="One per line, or separated by commas">
                    <textarea rows={3} className={inputClass} value={customNumbers} onChange={(e) => setCustomNumbers(e.target.value)} placeholder="0241234567" />
                  </Field>
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-lg bg-paper px-4 py-3 text-sm">
              <Users className="size-4 text-pew-600" />
              <span><strong>{recipients.length}</strong> {recipients.length === 1 ? 'person' : 'people'} will receive this message.</span>
              {recipients.length > 0 && (
                <button className="ml-auto font-medium text-pew-600 underline" onClick={() => setPreview(true)}>See the list</button>
              )}
            </div>
          </Panel>

          <Panel title="Your message">
            <textarea
              rows={5}
              className={inputClass}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Hello {name}, we missed you at {church} today…"
            />
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span>{parts.length} characters · {parts.parts} SMS {parts.parts === 1 ? 'part' : 'parts'} each</span>
              {parts.unicode && <span className="text-brass-700">Special characters shorten each part to 70 characters</span>}
              <span className="ml-auto">Use <code className="rounded bg-slate-100 px-1">{'{name}'}</code> and <code className="rounded bg-slate-100 px-1">{'{church}'}</code></span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {TEMPLATES.map((t) => (
                <button key={t.label} onClick={() => setBody(t.text)}
                  className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-50">
                  {t.label}
                </button>
              ))}
            </div>

            {body && recipients[0] && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-paper p-3 text-sm">
                <p className="mb-1 text-xs text-slate-500">Preview for {recipients[0].full_name || recipients[0].phone}</p>
                {personalise(body, recipients[0].full_name)}
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <Button size="lg" onClick={send} loading={sending} disabled={!settings?.sms_enabled}>
                <Send className="size-4" /> Send to {recipients.length}
              </Button>
            </div>
          </Panel>
        </div>

        <Panel title="Recent messages" action={
          <button onClick={loadHistory} className="text-slate-500 hover:text-ink" aria-label="Refresh"><RefreshCw className="size-4" /></button>
        }>
          {history.length === 0 ? (
            <Empty title="Nothing sent yet">Your sent messages will be listed here.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {history.map((h) => (
                <li key={h.id} className="py-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{h.audience_label || h.audience}</p>
                    <Badge tone={h.failed_count ? 'brass' : 'green'}>{h.sent_count}/{h.recipient_count}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600">{h.body}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {formatDate(h.created_at, { day: 'numeric', month: 'short' })} at {formatTime(h.created_at)}
                    {h.failed_count > 0 && ` · ${h.failed_count} failed`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Modal open={preview} onClose={() => setPreview(false)} title={`${recipients.length} recipients`} size="md"
        footer={<Button onClick={() => setPreview(false)}>Close</Button>}>
        <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto text-sm">
          {recipients.map((r) => (
            <li key={r.id} className="flex justify-between py-2">
              <span>{r.full_name || 'Typed number'}</span>
              <span className="text-slate-500">{r.phone}</span>
            </li>
          ))}
        </ul>
      </Modal>

      <Modal open={!!result} onClose={() => setResult(null)} title="Message sent" size="sm"
        footer={<Button onClick={() => setResult(null)}>Done</Button>}>
        <div className="py-2 text-center">
          {result?.failed ? <X className="mx-auto size-12 text-brass-500" /> : <CheckCircle2 className="mx-auto size-12 text-pew-600" />}
          <p className="mt-3 text-lg">Delivered to {result?.sent} {result?.sent === 1 ? 'person' : 'people'}.</p>
          {result?.failed > 0 && <p className="mt-1 text-sm text-slate-600">{result.failed} failed. Check those phone numbers.</p>}
        </div>
      </Modal>

      <TestModal open={testOpen} onClose={() => setTestOpen(false)} />
    </>
  )
}

function TestModal({ open, onClose }) {
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState(null)

  async function run() {
    setBusy(true)
    setOutcome(null)
    const { data, error } = await supabase.functions.invoke('send-sms', {
      body: { test_phone: phone, test_body: 'Test message from your church management system.' },
    })
    setBusy(false)
    setOutcome(error || data?.error ? { ok: false, text: data?.error || 'Sending failed.' } : { ok: true, text: `Sent to ${data.to}.` })
  }

  return (
    <Modal open={open} onClose={onClose} title="Send a test message" size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Close</Button><Button onClick={run} loading={busy}>Send test</Button></>}>
      <Field label="Phone number">
        <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0241234567" />
      </Field>
      {outcome && (
        <p className={`mt-3 text-sm ${outcome.ok ? 'text-pew-600' : 'text-absent'}`}>{outcome.text}</p>
      )}
    </Modal>
  )
}
