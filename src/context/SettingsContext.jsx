import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { money as fmtMoney } from '../lib/format'

const SettingsContext = createContext(null)

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
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const [s, l, g, a, ct] = await Promise.all([
      supabase.from('settings').select('*').eq('id', 1).single(),
      supabase.from('lookups').select('*').order('category').order('sort_order').order('value'),
      supabase.from('groups').select('*').order('name'),
      supabase.from('accounts').select('*').order('code'),
      supabase.from('contribution_types').select('*').order('sort_order').order('name'),
    ])
    if (s.data) setSettings(s.data)
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
    return {
      settings,
      loading,
      refresh,
      lookups,
      groups,
      activeGroups: groups.filter((g) => g.is_active),
      accounts,
      activeAccounts: accounts.filter((a) => a.is_active),
      cashAccounts: accounts.filter((a) => a.is_active && a.is_cash),
      contributionTypes,
      activeContributionTypes: contributionTypes.filter((t) => t.is_active),
      lookup: (category) => lookups.filter((l) => l.category === category && l.is_active).map((l) => l.value),
      groupName: (id) => groups.find((g) => g.id === id)?.name ?? '',
      accountById: (id) => accounts.find((a) => a.id === id),
      money: (n) => fmtMoney(n, symbol),
      symbol,
    }
  }, [settings, lookups, groups, accounts, contributionTypes, loading, refresh])

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider')
  return ctx
}
