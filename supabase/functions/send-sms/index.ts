// =====================================================================
// send-sms — bulk SMS sender (Hubtel Quick Send)
//
// The browser never talks to the SMS provider directly: credentials stay
// in the database and are only read here, on the server.
//
// Deploy from the Supabase dashboard (Edge Functions → Deploy a new
// function → paste this file) or with the CLI:
//   supabase functions deploy send-sms
// =====================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const authHeader = req.headers.get('Authorization') ?? ''

    // 1. Only signed-in admins may send
    const asUser = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: userData } = await asUser.auth.getUser()
    if (!userData?.user) return json({ error: 'Sign in first.' }, 401)
    const { data: isAdmin } = await asUser.rpc('is_admin')
    if (isAdmin !== true) return json({ error: 'This account cannot send messages.' }, 403)

    const db = createClient(url, serviceKey)
    const { message_id, test_phone, test_body } = await req.json()

    // 2. Provider credentials
    const { data: settings } = await db.from('settings').select('*').eq('id', 1).single()
    const clientId = settings?.sms_client_id?.trim()
    const clientSecret = settings?.sms_client_secret?.trim()
    const senderId = settings?.sms_sender_id?.trim()
    const dial = (settings?.country_dial_code ?? '233').replace(/\D/g, '')

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

    // 3. Single test message
    if (test_phone) {
      const to = toInternational(test_phone, dial)
      if (!to) return json({ error: 'That phone number does not look right.' }, 400)
      const r = await send(to, test_body || 'Test message from your church management system.')
      return r.ok ? json({ ok: true, to }) : json({ error: r.error ?? 'The provider rejected the message.' }, 400)
    }

    if (!message_id) return json({ error: 'No message to send.' }, 400)

    // 4. Bulk send
    const { data: message } = await db.from('sms_messages').select('*').eq('id', message_id).single()
    if (!message) return json({ error: 'Message not found.' }, 404)

    const { data: recipients } = await db
      .from('sms_recipients').select('*').eq('message_id', message_id).eq('status', 'pending')
    if (!recipients?.length) return json({ ok: true, sent: message.sent_count, failed: message.failed_count })

    await db.from('sms_messages').update({ status: 'sending' }).eq('id', message_id)

    let sent = 0
    let failed = 0
    const BATCH = 10   // small batches keep the provider happy

    for (let i = 0; i < recipients.length; i += BATCH) {
      const slice = recipients.slice(i, i + BATCH)
      await Promise.all(slice.map(async (r) => {
        const to = toInternational(r.phone, dial)
        if (!to) {
          failed++
          await db.from('sms_recipients')
            .update({ status: 'failed', error: 'Invalid phone number' }).eq('id', r.id)
          return
        }
        const personalised = message.body
          .replaceAll('{name}', (r.name ?? '').split(' ')[0] || 'beloved')
          .replaceAll('{church}', settings.church_name ?? 'church')
        const result = await send(to, personalised)
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
    }).eq('id', message_id)

    return json({ ok: true, sent, failed })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Sending failed.' }, 500)
  }
})
