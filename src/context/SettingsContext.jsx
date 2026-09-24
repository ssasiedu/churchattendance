import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { money as fmtMoney } from '../lib/format'

const SettingsContext = createContext(null)

// What every administrator could do before roles existed. Used when the
// database has not been upgraded yet, so the app keeps working.
const ALL_PERMISSIONS = [
  'members.view_all', 'members.manage', 'attendance.manage', 'finance.view', 'finance.record',
  'finance.manage', 'sms.send', 'assets.manage', 'reports.view', 'settings.manage', 'users.manage',
]

/**
 * Loads everything the app treats as configuration: the church profile,
 * dropdown values, groups, accounts and contribution types.
 */
export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(null)
  const [lookups, setLookups] = useState([])
  const [groups, setGroups] = useState([])
  const [accounts, setAccounts] = useState([])
  const [contributionTypes, setContributionTypes] = useState([])
  const [profile, setProfile] = useState(null)
  const [needsUpgrade, setNeedsUpgrade] = useState(false)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const [s, l, g, a, ct, me] = await Promise.all([
      supabase.from('settings').select('*').eq('id', 1).single(),
      supabase.from('lookups').select('*').order('category').order('sort_order').order('value'),
      supabase.from('groups').select('*').order('name'),
      supabase.from('accounts').select('*').order('code'),
      supabase.from('contribution_types').select('*').order('sort_order').order('name'),
      supabase.rpc('my_profile'),
    ])
    if (s.data) setSettings(s.data)

    if (me.error || !me.data) {
      // my_profile() is missing, which means schema.sql has not been re-run yet.
      // Fall back to full access so nobody is locked out of their own system.
      setNeedsUpgrade(true)
      setProfile({ role: 'Administrator', permissions: ALL_PERMISSIONS, full_name: null })
    } else {
      setNeedsUpgrade(false)
      setProfile(me.data)
    }
    setLookups(l.data ?? [])
    setGroups(g.data ?? [])
    setAccounts(a.data ?? [])
    setContributionTypes(ct.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const value = useMemo(() => {
    const symbol = settings?.currency_symbol || 'GH₵'
    const permissions = profile?.permissions ?? []
    return {
      settings,
      profile,
      needsUpgrade,
      permissions,
      can: (permission) => permissions.includes(permission),
      canAny: (...list) => list.some((permission) => permissions.includes(permission)),
      loading,
      refresh,
      lookups,
      groups,
      activeGroups: groups.filter((g) => g.is_active),
      accounts,
      activeAccounts: accounts.filter((a) => a.is_active),
      cashAccounts: accounts.filter((a) => a.is_active && a.is_cash),
      contributionTypes,
      activeContributionTypes: contributionTypes.filter((t) => t.is_active && !t.is_archived),
      billableTypes: contributionTypes.filter((t) => t.is_billable && !t.is_archived),
      lookup: (category) => lookups.filter((l) => l.category === category && l.is_active).map((l) => l.value),
      groupName: (id) => groups.find((g) => g.id === id)?.name ?? '',
      accountById: (id) => accounts.find((a) => a.id === id),
      money: (n) => fmtMoney(n, symbol),
      symbol,
    }
  }, [settings, lookups, groups, accounts, contributionTypes, profile, needsUpgrade, loading, refresh])

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider')
  return ctx
}
