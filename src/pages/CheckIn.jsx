import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Search, CheckCircle2, RefreshCw, X, Church } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { cn, formatDate, initials, matchesSearch, normalize } from '../lib/utils'
import { Button, Spinner } from '../components/ui'
import Modal from '../components/Modal'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const rememberKey = (id) => `checkin:${id}`

export default function CheckIn() {
  const { serviceId } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [letter, setLetter] = useState(null)
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [mine, setMine] = useState(null)
  const searchRef = useRef(null)

  const load = useCallback(async () => {
    setError(null)
    const { data, error } = await supabase.rpc('get_checkin_data', { p_service_id: serviceId ?? null })
    if (error) setError('Could not load the member list. Check your connection and try again.')
    else setData(data)
    setLoading(false)
  }, [serviceId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!data?.service) return
    try { setMine(localStorage.getItem(rememberKey(data.service.id))) } catch { /* storage off */ }
  }, [data?.service])

  const members = data?.members ?? []
  const presentCount = members.filter((m) => m.present).length
  const churchName = data?.church?.name ?? 'Church attendance'

  const letters = useMemo(() => {
    const set = new Set(members.map((m) => normalize(m.full_name).charAt(0).toUpperCase()))
    return LETTERS.filter((l) => set.has(l))
  }, [members])

  const filtered = useMemo(
    () =>
      members.filter((m) => {
        if (query) return matchesSearch(m.full_name, query)
        if (letter) return normalize(m.full_name).startsWith(letter.toLowerCase())
        return true
      }),
    [members, query, letter]
  )

  async function confirm() {
    if (!selected) return
    setBusy(true)
    const { data: result, error } = await supabase.rpc('mark_present', {
      p_service_id: data.service.id, p_member_id: selected.id,
    })
    setBusy(false)

    if (error) {
      setMessage({ tone: 'error', text: 'That didn’t go through. Check your connection and tap the name again.' })
      setSelected(null)
      return
    }
    if (result === 'closed' || result === 'invalid') {
      setMessage({
        tone: 'error',
        text: result === 'closed' ? 'Check-in for this service has closed. Please see an usher.' : 'That name is no longer on the list. Please see an usher.',
      })
      setSelected(null)
      load()
      return
    }

    setData((d) => ({ ...d, members: d.members.map((m) => (m.id === selected.id ? { ...m, present: true } : m)) }))
    try { localStorage.setItem(rememberKey(data.service.id), selected.full_name) } catch { /* ignore */ }
    setMine(selected.full_name)
    setMessage({
      tone: 'ok',
      text: result === 'already'
        ? `${selected.full_name} was already marked present.`
        : `Welcome, ${selected.full_name.split(' ')[0]}! You’re marked present.`,
    })
    setSelected(null)
    setQuery('')
    setLetter(null)
  }

  if (loading) return <Spinner label="Loading today’s service…" />

  if (error) {
    return (
      <Centered>
        <h1 className="font-display text-2xl">Can’t load check-in</h1>
        <p className="mt-2 text-slate-600">{error}</p>
        <Button className="mt-6" onClick={load}><RefreshCw className="size-4" /> Try again</Button>
      </Centered>
    )
  }

  if (!data) {
    return (
      <Centered>
        <Church className="mx-auto size-10 text-pew-600" />
        <h1 className="mt-4 font-display text-2xl">Check-in isn’t open</h1>
        <p className="mt-2 text-slate-600">There’s no service accepting check-ins right now. If the service has started, please let an usher know.</p>
        <Button variant="outline" className="mt-6" onClick={load}><RefreshCw className="size-4" /> Check again</Button>
      </Centered>
    )
  }

  const { service } = data

  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-white sm:my-6 sm:min-h-0 sm:rounded-2xl sm:border sm:border-slate-200">
      <header className="bg-pew-900 px-5 pt-6 pb-5 text-white sm:rounded-t-2xl">
        <div className="flex items-center gap-3">
          {data.church?.logo_url && <img src={data.church.logo_url} alt="" className="size-10 rounded-lg bg-white object-contain p-0.5" />}
          <p className="text-sm text-pew-200">{churchName}</p>
        </div>
        <h1 className="mt-2 font-display text-3xl leading-tight">{service.title}</h1>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-pew-100">{formatDate(service.service_date, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          <span className="rounded-full bg-pew-700 px-3 py-1 text-brass-300">{presentCount} of {members.length} present</span>
        </div>
      </header>

      {mine && (
        <div className="flex items-center gap-3 border-b border-pew-100 bg-pew-50 px-5 py-3 text-sm text-pew-700">
          <CheckCircle2 className="size-5 shrink-0" />
          <span>This phone checked in <strong>{mine}</strong>. Checking in someone else? Find their name below.</span>
        </div>
      )}

      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 pt-4 pb-3 backdrop-blur">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-slate-400" />
          <input
            ref={searchRef}
            type="search"
            inputMode="search"
            autoComplete="off"
            placeholder="Type your name"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setLetter(null) }}
            className="h-14 w-full rounded-xl border border-slate-300 bg-paper pr-12 pl-11 text-lg placeholder:text-slate-400 focus:border-pew-500 focus:bg-white focus:ring-2 focus:ring-pew-100 focus:outline-none"
            aria-label="Search your name"
          />
          {query && (
            <button onClick={() => { setQuery(''); searchRef.current?.focus() }}
              className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-1.5 text-slate-500 hover:bg-slate-200" aria-label="Clear search">
              <X className="size-4" />
            </button>
          )}
        </div>

        {!query && letters.length > 1 && (
          <div className="-mx-5 mt-3 flex gap-1 overflow-x-auto px-5 pb-1" role="tablist" aria-label="Browse by first letter">
            <LetterChip active={!letter} onClick={() => setLetter(null)}>All</LetterChip>
            {letters.map((l) => (
              <LetterChip key={l} active={letter === l} onClick={() => setLetter(l)}>{l}</LetterChip>
            ))}
          </div>
        )}
      </div>

      <ul className="divide-y divide-slate-100 pb-10">
        {filtered.map((m) => (
          <li key={m.id}>
            <button
              onClick={() => !m.present && setSelected(m)}
              disabled={m.present}
              className={cn('flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors',
                m.present ? 'cursor-default' : 'hover:bg-pew-50 active:bg-pew-100')}
            >
              <span className={cn('grid size-11 shrink-0 place-items-center rounded-full text-sm font-semibold',
                m.present ? 'bg-pew-600 text-white' : 'bg-slate-100 text-slate-600')}>
                {m.present ? <CheckCircle2 className="size-5" /> : initials(m.full_name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate text-base font-semibold', m.present && 'text-slate-500')}>{m.full_name}</span>
                {m.group_name && <span className="block truncate text-sm text-slate-500">{m.group_name}</span>}
              </span>
              {m.present
                ? <span className="text-sm font-medium text-pew-600">Present</span>
                : <span className="rounded-lg border border-pew-200 px-3 py-1.5 text-sm font-semibold text-pew-600">Check in</span>}
            </button>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-5 py-12 text-center">
            <p className="font-semibold">No name matches “{query}”</p>
            <p className="mt-1 text-sm text-slate-500">Try your first name only, or see an usher to be added to the register.</p>
          </li>
        )}
      </ul>

      <footer className="border-t border-slate-100 px-5 py-4 text-center text-xs text-slate-400">
        <Link to="/login" className="hover:text-slate-600">Admin</Link>
      </footer>

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Confirm check-in" size="sm"
        footer={<><Button variant="ghost" onClick={() => setSelected(null)}>Not me</Button><Button onClick={confirm} loading={busy}>Mark present</Button></>}>
        <div className="py-2 text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-pew-50 font-display text-2xl text-pew-600">
            {initials(selected?.full_name)}
          </span>
          <p className="mt-3 font-display text-2xl">{selected?.full_name}</p>
          <p className="mt-1 text-sm text-slate-500">{service.title}, {formatDate(service.service_date, { day: 'numeric', month: 'short' })}</p>
        </div>
      </Modal>

      <Modal open={!!message} onClose={() => setMessage(null)} size="sm"
        title={message?.tone === 'ok' ? 'Checked in' : 'Not checked in'}
        footer={<Button onClick={() => setMessage(null)}>Done</Button>}>
        <div className="py-2 text-center">
          {message?.tone === 'ok' && <CheckCircle2 className="mx-auto size-14 text-pew-600" />}
          <p className="mt-3 text-lg">{message?.text}</p>
        </div>
      </Modal>
    </div>
  )
}

function LetterChip({ active, onClick, children }) {
  return (
    <button role="tab" aria-selected={active} onClick={onClick}
      className={cn('h-9 min-w-9 shrink-0 rounded-lg px-2.5 font-display text-base transition-colors',
        active ? 'bg-pew-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
      {children}
    </button>
  )
}

function Centered({ children }) {
  return <div className="mx-auto mt-24 max-w-md px-6 text-center">{children}</div>
}
