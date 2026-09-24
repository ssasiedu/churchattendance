import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cake, Send, PhoneCall, Search } from 'lucide-react'
import { supabase, fetchAll } from '../lib/supabase'
import { useSettings } from '../context/SettingsContext'
import { sendSms } from '../lib/sms'
import { age } from '../lib/format'
import { formatDate, initials, matchesSearch, toISODate } from '../lib/utils'
import { Badge, Button, Empty, ErrorNote, Field, PageHeader, Panel, Spinner, Tabs, inputClass } from '../components/ui'
import Modal from '../components/Modal'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const dayKey = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export default function Birthdays() {
  const { settings, groupName, can } = useSettings()
  const [members, setMembers] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('today')
  const [query, setQuery] = useState('')
  const [sendTo, setSendTo] = useState(null)
  const [notice, setNotice] = useState(null)

  const load = useCallback(async () => {
    try {
      const [mem, msgs] = await Promise.all([
        fetchAll(() => supabase.from('members').select('id, full_name, phone, date_of_birth, group_id, photo_url, is_active').order('full_name').order('id')),
        supabase.from('sms_messages').select('*').eq('audience', 'birthday').order('created_at', { ascending: false }).limit(10),
      ])
      setMembers(mem.filter((m) => m.is_active && m.date_of_birth))
      setHistory(msgs.data ?? [])
    } catch (e) { setError(e) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const now = new Date()
  const todayKey = dayKey(now)

  const sorted = useMemo(() => {
    const withKey = members.map((m) => {
      const d = new Date(m.date_of_birth)
      return { ...m, key: `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, month: d.getMonth(), day: d.getDate() }
    })
    return withKey.sort((a, b) => a.key.localeCompare(b.key) || a.full_name.localeCompare(b.full_name))
  }, [members])

  const todays = sorted.filter((m) => m.key === todayKey)

  const week = useMemo(() => {
    const keys = new Set()
    for (let i = 0; i < 7; i++) keys.add(dayKey(new Date(Date.now() + i * 86400000)))
    return sorted.filter((m) => keys.has(m.key))
  }, [sorted, todayKey])

  const thisMonth = sorted.filter((m) => m.month === now.getMonth())

  const list = (tab === 'today' ? todays : tab === 'week' ? week : tab === 'month' ? thisMonth : sorted)
    .filter((m) => matchesSearch(m.full_name, query))

  const alreadySentToday = history.some((h) => h.created_at?.slice(0, 10) === toISODate(now))

  return (
    <>
      <PageHeader
        title="Birthdays"
        subtitle={`${todays.length ? `${todays.length} today` : 'Nobody today'} · ${thisMonth.length} this month`}
        actions={can('sms.send') && todays.length > 0 && (
          <Button onClick={() => setSendTo(todays)}><Send className="size-4" /> Send today’s wishes</Button>
        )}
      />
      <ErrorNote error={error} />
      {notice && <div className="mb-4 rounded-lg border border-pew-200 bg-pew-50 px-4 py-3 text-sm text-pew-700">{notice}</div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Tabs value={tab} onChange={setTab} options={[
              { key: 'today', label: `Today (${todays.length})` },
              { key: 'week', label: `Next 7 days (${week.length})` },
              { key: 'month', label: `${MONTHS[now.getMonth()]} (${thisMonth.length})` },
              { key: 'all', label: 'Everyone' },
            ]} />
            <div className="relative min-w-40 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <input className={`${inputClass} pl-9`} placeholder="Find a name" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          </div>

          {loading ? <Spinner /> : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <ul className="divide-y divide-slate-100">
                {list.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                    {m.photo_url
                      ? <img src={m.photo_url} alt="" className="size-10 shrink-0 rounded-full object-cover" />
                      : <span className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">{initials(m.full_name)}</span>}
                    <div className="min-w-0 flex-1">
                      <Link to={`/members/${m.id}`} className="block truncate font-medium hover:text-pew-600 hover:underline">{m.full_name}</Link>
                      <p className="truncate text-sm text-slate-500">
                        {MONTHS[m.month]} {m.day}
                        {m.date_of_birth && ` · turns ${age(m.date_of_birth) + (m.key >= todayKey ? 1 : 0)}`}
                        {groupName(m.group_id) && ` · ${groupName(m.group_id)}`}
                      </p>
                    </div>
                    {m.key === todayKey && <Badge tone="brass">Today</Badge>}
                    {m.phone && <a href={`tel:${m.phone}`} className="rounded-md p-1.5 text-pew-600 hover:bg-pew-50" aria-label={`Call ${m.full_name}`}><PhoneCall className="size-4" /></a>}
                    {can('sms.send') && m.phone && (
                      <Button size="sm" variant="outline" onClick={() => setSendTo([m])}><Send className="size-4" /> Wish</Button>
                    )}
                  </li>
                ))}
                {!list.length && (
                  <li><Empty title="Nobody here">
                    {members.length ? 'Try another tab.' : 'Add dates of birth to member records and they will show up here.'}
                  </Empty></li>
                )}
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <Panel title="Automatic wishes">
            <div className="flex items-start gap-3">
              <Cake className="mt-0.5 size-5 shrink-0 text-brass-500" />
              <div className="text-sm">
                <p className="font-medium">{settings?.sms_birthday_enabled ? 'Switched on' : 'Switched off'}</p>
                <p className="mt-1 text-slate-600">
                  {settings?.sms_birthday_enabled
                    ? 'Members are wished automatically on the day, as long as the daily schedule is set up in Supabase.'
                    : 'Turn it on under Settings → Automatic messages, then you can also let Supabase send them every morning.'}
                </p>
                {alreadySentToday && <p className="mt-2 text-pew-600">Today’s wishes have gone out.</p>}
              </div>
            </div>
            <div className="mt-4 rounded-lg bg-paper p-3 text-sm">
              <p className="text-xs text-slate-500">Message template</p>
              <p className="mt-1">{settings?.sms_birthday_template}</p>
            </div>
            <Link to="/settings" className="mt-3 inline-block text-sm font-medium text-pew-600 underline">Edit in Settings</Link>
          </Panel>

          <Panel title="Recent birthday messages">
            {history.length === 0 ? <Empty title="None sent yet" /> : (
              <ul className="divide-y divide-slate-100 text-sm">
                {history.map((h) => (
                  <li key={h.id} className="flex justify-between py-2">
                    <span>{formatDate(h.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    <Badge tone={h.failed_count ? 'brass' : 'green'}>{h.sent_count}/{h.recipient_count}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <WishModal
        people={sendTo}
        settings={settings}
        onClose={() => setSendTo(null)}
        onSent={(n) => { setSendTo(null); setNotice(`Birthday wishes sent to ${n}.`); load() }}
      />
    </>
  )
}

function WishModal({ people, settings, onClose, onSent }) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (people) {
      setBody(settings?.sms_birthday_template ?? 'Happy birthday {name}! The whole {church} family celebrates with you today.')
      setError(null)
    }
  }, [people, settings])

  if (!people) return null
  const withPhone = people.filter((p) => p.phone)

  async function send() {
    setBusy(true)
    setError(null)
    const res = await sendSms({
      body,
      audience: 'birthday',
      audienceLabel: `Birthday wishes — ${new Date().toLocaleDateString()}`,
      recipients: withPhone,
      dial: settings?.country_dial_code,
    })
    setBusy(false)
    if (res.error) setError(res.error)
    else onSent(`${res.sent} ${res.sent === 1 ? 'person' : 'people'}`)
  }

  return (
    <Modal open onClose={onClose} title={`Birthday wishes for ${withPhone.length} ${withPhone.length === 1 ? 'member' : 'members'}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={send} loading={busy} disabled={!withPhone.length}><Send className="size-4" /> Send</Button></>}>
      <ErrorNote error={error} />
      <Field label="Message" hint="{name} becomes their first name, {church} your church name">
        <textarea rows={4} className={inputClass} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      {people.length !== withPhone.length && (
        <p className="mt-2 text-sm text-brass-700">{people.length - withPhone.length} of them have no phone number on file.</p>
      )}
      <ul className="mt-3 max-h-40 divide-y divide-slate-100 overflow-y-auto text-sm">
        {withPhone.map((p) => (
          <li key={p.id} className="flex justify-between py-1.5"><span>{p.full_name}</span><span className="text-slate-500">{p.phone}</span></li>
        ))}
      </ul>
    </Modal>
  )
}
