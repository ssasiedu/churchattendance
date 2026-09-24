// =====================================================================
// send-sms — bulk SMS, test messages and the daily birthday run
//
// The browser never talks to the SMS provider directly: credentials stay
// in the database and are only read here, on the server.
//
// Deploy from the Supabase dashboard (Edge Functions → Deploy a new
// function → paste this file) or with the CLI:
//   supabase functions deploy send-sms
//
// Accepts one of:
//   { message_id }                 send a queued bulk message
//   { test_phone, test_body }      send a single test message
//   { task: 'birthdays', date? }   message everyone whose birthday it is
// =====================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

/** 0244123456 → 233244123456 (E.164 without the plus, as Hubtel expects) */
function toInternational(raw: string, dial: string): string | null {
  const digits = String(raw ?? '').replace(/[^\d+]/g, '').replace(/^\+/, '')
  if (!digits) return null
  if (digits.startsWith(dial) && digits.length >= dial.length + 9) return digits
  if (digits.startsWith('0')) return dial + digits.slice(1)
  if (digits.length === 9) return dial + digits
  return digits.length >= 10 ? digits : null
}

const personalise = (text: string, name: string | null, church: string) =>
  text
    .replaceAll('{name}', (name ?? '').split(' ')[0] || 'beloved')
    .replaceAll('{church}', church)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const db = createClient(url, serviceKey)

    const body = await req.json().catch(() => ({}))
    const { message_id, test_phone, test_body, task, date, force } = body

    const { data: settings } = await db.from('settings').select('*').eq('id', 1).single()

    // A signed-in admin, or the scheduled job using the church's cron secret
    const cronSecret = req.headers.get('x-cron-secret')
    const viaCron = Boolean(settings?.cron_secret && cronSecret && cronSecret === settings.cron_secret)

    if (!viaCron) {
      const asUser = createClient(url, anonKey, {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      })
      const { data: userData } = await asUser.auth.getUser()
      if (!userData?.user) return json({ error: 'Sign in first.' }, 401)
      const { data: allowed } = await asUser.rpc('can', { p_permission: 'sms.send' })
      if (allowed !== true) return json({ error: 'This account cannot send messages.' }, 403)
    }

    const clientId = settings?.sms_client_id?.trim()
    const clientSecret = settings?.sms_client_secret?.trim()
    const senderId = settings?.sms_sender_id?.trim()
    const dial = (settings?.country_dial_code ?? '233').replace(/\D/g, '')
    const church = settings?.church_name ?? 'church'

    if (!settings?.sms_enabled) return json({ error: 'SMS is switched off in Settings.' }, 400)
    if (!clientId || !clientSecret || !senderId) {
      return json({ error: 'Add your Client ID, Client Secret and Sender ID in Settings → SMS.' }, 400)
    }

    const send = async (to: string, content: string) => {
      const endpoint =
        `https://smsc.hubtel.com/v1/messages/send?clientid=${encodeURIComponent(clientId)}` +
        `&clientsecret=${encodeURIComponent(clientSecret)}` +
        `&from=${encodeURIComponent(senderId)}` +
        `&to=${encodeURIComponent(to)}` +
        `&content=${encodeURIComponent(content)}`
      const res = await fetch(endpoint)
      const text = await res.text()
      let payload: Record<string, unknown> = {}
      try { payload = JSON.parse(text) } catch { /* provider returned plain text */ }
      const status = payload?.status ?? payload?.Status
      const ok = res.ok && (status === 0 || status === '0' || status === undefined)
      return {
        ok,
        id: (payload?.messageId ?? payload?.MessageId ?? null) as string | null,
        error: ok ? null : (payload?.message ?? payload?.Message ?? text.slice(0, 300)),
      }
    }

    /** Works through the pending recipients of a queued message */
    const deliver = async (msgId: string) => {
      const { data: message } = await db.from('sms_messages').select('*').eq('id', msgId).single()
      if (!message) return { error: 'Message not found.' }

      const { data: recipients } = await db
        .from('sms_recipients').select('*').eq('message_id', msgId).eq('status', 'pending')
      if (!recipients?.length) return { ok: true, sent: message.sent_count, failed: message.failed_count }

      await db.from('sms_messages').update({ status: 'sending' }).eq('id', msgId)

      let sent = 0
      let failed = 0
      const BATCH = 10   // small batches keep the provider happy

      for (let i = 0; i < recipients.length; i += BATCH) {
        await Promise.all(recipients.slice(i, i + BATCH).map(async (r) => {
          const to = toInternational(r.phone, dial)
          if (!to) {
            failed++
            await db.from('sms_recipients').update({ status: 'failed', error: 'Invalid phone number' }).eq('id', r.id)
            return
          }
          const result = await send(to, personalise(message.body, r.name, church))
          if (result.ok) {
            sent++
            await db.from('sms_recipients')
              .update({ status: 'sent', provider_id: result.id, sent_at: new Date().toISOString(), error: null })
              .eq('id', r.id)
          } else {
            failed++
            await db.from('sms_recipients')
              .update({ status: 'failed', error: String(result.error).slice(0, 300) }).eq('id', r.id)
          }
        }))
      }

      await db.from('sms_messages').update({
        sent_count: (message.sent_count ?? 0) + sent,
        failed_count: (message.failed_count ?? 0) + failed,
        status: 'completed',
      }).eq('id', msgId)

      return { ok: true, sent, failed }
    }

    // --- single test message ------------------------------------------
    if (test_phone) {
      const to = toInternational(test_phone, dial)
      if (!to) return json({ error: 'That phone number does not look right.' }, 400)
      const r = await send(to, test_body || 'Test message from your church management system.')
      return r.ok ? json({ ok: true, to }) : json({ error: r.error ?? 'The provider rejected the message.' }, 400)
    }

    // --- birthdays ----------------------------------------------------
    if (task === 'birthdays') {
      const day = date ?? new Date().toISOString().slice(0, 10)
      if (!settings.sms_birthday_enabled && !force) return json({ ok: true, sent: 0, skipped: 'Birthday messages are switched off.' })
      if (settings.birthday_last_run === day && !force) return json({ ok: true, sent: 0, skipped: 'Already run today.' })

      const { data: people } = await db.rpc('birthdays_on', { p_date: day })
      const withPhone = (people ?? []).filter((m: { phone: string | null }) => toInternational(m.phone ?? '', dial))

      await db.from('settings').update({ birthday_last_run: day }).eq('id', 1)
      if (!withPhone.length) return json({ ok: true, sent: 0, recipients: 0 })

      const { data: message } = await db.from('sms_messages').insert({
        body: settings.sms_birthday_template ?? 'Happy birthday {name}! The whole {church} family celebrates with you today.',
        audience: 'birthday',
        audience_label: `Birthdays on ${day}`,
        recipient_count: withPhone.length,
      }).select().single()

      await db.from('sms_recipients').insert(
        withPhone.map((m: { id: string; full_name: string; phone: string }) => ({
          message_id: message.id, member_id: m.id, name: m.full_name, phone: m.phone,
        }))
      )

      const result = await deliver(message.id)
      return json({ ...result, recipients: withPhone.length })
    }

    // --- bulk ---------------------------------------------------------
    if (!message_id) return json({ error: 'No message to send.' }, 400)
    const result = await deliver(message_id)
    return result.error ? json(result, 400) : json(result)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Sending failed.' }, 500)
  }
})
