import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

export interface Preferences {
  theme: 'dark' | 'light' | 'system'; accent: 'mint' | 'blue' | 'violet'
  reducedMotion: boolean; density: 'comfortable' | 'compact'; refreshInterval: number
  timezone: 'local' | 'UTC' | 'Asia/Kolkata'; sidebarCollapsed: boolean
  notifications: boolean; incidentNotifications: boolean; mattermostUrl: string
}
export const defaults: Preferences = {
  theme: 'dark', accent: 'mint', reducedMotion: false, density: 'comfortable', refreshInterval: 5,
  timezone: 'Asia/Kolkata', sidebarCollapsed: false, notifications: true, incidentNotifications: true, mattermostUrl: '',
}
export const storageKey = 'deployguard.preferences.v1'
export function safeRoomUrl(value: string): string | null {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null
  } catch { return null }
}
export function loadPreferences(): Preferences {
  try {
    const p = JSON.parse(localStorage.getItem(storageKey) || '{}')
    return {
      theme: ['dark', 'light', 'system'].includes(p.theme) ? p.theme : defaults.theme,
      accent: ['mint', 'blue', 'violet'].includes(p.accent) ? p.accent : defaults.accent,
      reducedMotion: typeof p.reducedMotion === 'boolean' ? p.reducedMotion : defaults.reducedMotion,
      density: ['comfortable', 'compact'].includes(p.density) ? p.density : defaults.density,
      refreshInterval: [5, 15, 30, 60, 120].includes(p.refreshInterval) ? p.refreshInterval : defaults.refreshInterval,
      timezone: ['local', 'UTC', 'Asia/Kolkata'].includes(p.timezone) ? p.timezone : defaults.timezone,
      sidebarCollapsed: typeof p.sidebarCollapsed === 'boolean' ? p.sidebarCollapsed : defaults.sidebarCollapsed,
      notifications: typeof p.notifications === 'boolean' ? p.notifications : defaults.notifications,
      incidentNotifications: typeof p.incidentNotifications === 'boolean' ? p.incidentNotifications : defaults.incidentNotifications,
      mattermostUrl: typeof p.mattermostUrl === 'string' && safeRoomUrl(p.mattermostUrl) ? p.mattermostUrl : '',
    }
  } catch { return { ...defaults } }
}
const Context = createContext<{ preferences: Preferences; update: (patch: Partial<Preferences>) => void }>({ preferences: defaults, update: () => {} })
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(loadPreferences)
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(preferences)) } catch { /* Preferences still work in memory. */ } }, [preferences])
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: light)')
    const apply = () => {
      document.documentElement.dataset.theme = preferences.theme === 'system' ? (media.matches ? 'light' : 'dark') : preferences.theme
      document.documentElement.dataset.accent = preferences.accent
      document.documentElement.dataset.density = preferences.density
      document.documentElement.dataset.motion = preferences.reducedMotion ? 'reduced' : 'auto'
    }
    apply(); media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [preferences.theme, preferences.accent, preferences.density, preferences.reducedMotion])
  return <Context.Provider value={{ preferences, update: patch => setPreferences(p => ({ ...p, ...patch })) }}>{children}</Context.Provider>
}
export const usePreferences = () => useContext(Context)
