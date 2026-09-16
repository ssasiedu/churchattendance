import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isConfigured = Boolean(url && key)

export const supabase = createClient(url || 'http://localhost:54321', key || 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true },
})

/**
 * Supabase returns at most 1000 rows per request.
 * Pass a function that builds a fresh query; this pages through all rows.
 */
export async function fetchAll(buildQuery, pageSize = 1000) {
  let from = 0
  let rows = []
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1)
    if (error) throw error
    rows = rows.concat(data ?? [])
    if (!data || data.length < pageSize) break
    from += pageSize
  }
  return rows
}
