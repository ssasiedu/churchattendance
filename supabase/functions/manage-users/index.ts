// =====================================================================
// manage-users — create, update and remove people who can sign in
//
// Creating a login needs Supabase's admin API, which must never run in a
// browser, so it runs here. Only a user with the "users.manage"
// permission can call it.
//
// Deploy from the dashboard (Edge Functions → Deploy a new function →
// name it manage-users → paste this file) or with the CLI:
//   supabase functions deploy manage-users
// =====================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const asUser = createClient(url, anonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: userData } = await asUser.auth.getUser()
    if (!userData?.user) return json({ error: 'Sign in first.' }, 401)
    const { data: allowed } = await asUser.rpc('can', { p_permission: 'users.manage' })
    if (allowed !== true) return json({ error: 'This account cannot manage users.' }, 403)

    const db = createClient(url, serviceKey)
    const { action, user_id, email, password, full_name, phone, role_id, group_id, ministry, is_active } = await req.json()

    if (action === 'create') {
      if (!email || !password) return json({ error: 'An email and a password are needed.' }, 400)
      if (String(password).length < 8) return json({ error: 'Use a password of at least 8 characters.' }, 400)

      const { data: created, error } = await db.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { full_name },
      })
      if (error) return json({ error: error.message }, 400)

      const { error: e2 } = await db.from('admins').insert({
        user_id: created.user.id, full_name, email, phone: phone ?? null,
        role_id: role_id ?? null, group_id: group_id ?? null, ministry: ministry ?? null, is_active: true,
      })
      if (e2) {
        await db.auth.admin.deleteUser(created.user.id)   // don't leave an orphan login behind
        return json({ error: e2.message }, 400)
      }
      return json({ ok: true, user_id: created.user.id })
    }

    if (action === 'update') {
      if (!user_id) return json({ error: 'No user chosen.' }, 400)
      const patch: Record<string, unknown> = {}
      for (const [k, v] of Object.entries({ full_name, email, phone, role_id, group_id, ministry, is_active })) {
        if (v !== undefined) patch[k] = v
      }
      const { error } = await db.from('admins').update(patch).eq('user_id', user_id)
      if (error) return json({ error: error.message }, 400)

      if (password) {
        if (String(password).length < 8) return json({ error: 'Use a password of at least 8 characters.' }, 400)
        const { error: e2 } = await db.auth.admin.updateUserById(user_id, { password })
        if (e2) return json({ error: e2.message }, 400)
      }
      if (email) await db.auth.admin.updateUserById(user_id, { email })
      return json({ ok: true })
    }

    if (action === 'delete') {
      if (!user_id) return json({ error: 'No user chosen.' }, 400)
      if (user_id === userData.user.id) return json({ error: 'You cannot remove your own access.' }, 400)
      await db.from('admins').delete().eq('user_id', user_id)
      const { error } = await db.auth.admin.deleteUser(user_id)
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    return json({ error: 'Unknown action.' }, 400)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Something went wrong.' }, 500)
  }
})
