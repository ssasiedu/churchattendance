import { supabase } from './supabase'
import { toInternational } from './format'

/**
 * Queues a message and asks the send-sms function to deliver it.
 * Recipients are { id?, full_name, phone } objects; those without a
 * usable number are dropped.
 */
export async function sendSms({ body, audience, audienceLabel, recipients, serviceId = null, groupId = null, dial = '233' }) {
  const usable = (recipients ?? []).filter((r) => toInternational(r.phone, dial))
  if (!body?.trim()) return { error: 'There is no message to send.' }
  if (!usable.length) return { error: 'No one in this list has a usable phone number.' }

  const { data: message, error } = await supabase.from('sms_messages').insert({
    body: body.trim(),
    audience,
    audience_label: audienceLabel ?? audience,
    service_id: serviceId,
    group_id: groupId,
    recipient_count: usable.length,
  }).select().single()
  if (error) return { error }

  const rows = usable.map((r) => ({
    message_id: message.id,
    member_id: r.id && !String(r.id).startsWith('custom-') ? r.id : null,
    name: r.full_name || null,
    phone: r.phone,
  }))
  for (let i = 0; i < rows.length; i += 400) {
    const { error: e } = await supabase.from('sms_recipients').insert(rows.slice(i, i + 400))
    if (e) return { error: e }
  }

  const { data, error: fnError } = await supabase.functions.invoke('send-sms', { body: { message_id: message.id } })
  if (fnError || data?.error) {
    return { error: data?.error || 'The message could not be sent. Check Settings → SMS and that the send-sms function is deployed.' }
  }
  return { sent: data.sent, failed: data.failed, messageId: message.id }
}

/** Fills {name} style placeholders in a template */
export function fillTemplate(template, values) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, value ?? ''),
    template ?? ''
  )
}
