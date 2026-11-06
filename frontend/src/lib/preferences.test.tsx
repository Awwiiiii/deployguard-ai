import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { defaults, loadPreferences, PreferencesProvider, safeRoomUrl, storageKey, usePreferences } from './preferences'

it('recovers safely from damaged or unavailable preference data', () => {
  localStorage.setItem(storageKey, '{broken')
  expect(loadPreferences()).toEqual(defaults)
  localStorage.setItem(storageKey, 'null')
  expect(loadPreferences()).toEqual(defaults)
})
it('loads only allowed non-sensitive fields and bounded polling settings', () => {
  localStorage.setItem(storageKey, JSON.stringify({ theme: 'light', refreshInterval: 1, secret: 'never keep this', density: 'invalid' }))
  expect(loadPreferences()).toEqual({ ...defaults, theme: 'light' })
  expect(loadPreferences()).not.toHaveProperty('secret')
})
it('rejects executable links and embedded credentials', () => {
  expect(safeRoomUrl('javascript:alert(1)')).toBeNull()
  expect(safeRoomUrl('https://operator:password@example.com/room')).toBeNull()
  expect(safeRoomUrl('http://localhost:8065/team/channels/incidents')).toContain('localhost:8065')
})
it('applies and persists the theme, density, and motion preferences', () => {
  function Harness() { const { update } = usePreferences(); return <button onClick={() => update({ theme: 'light', reducedMotion: true, density: 'compact' })}>Change</button> }
  render(<PreferencesProvider><Harness /></PreferencesProvider>)
  fireEvent.click(screen.getByText('Change'))
  expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  expect(document.documentElement).toHaveAttribute('data-density', 'compact')
  expect(document.documentElement).toHaveAttribute('data-motion', 'reduced')
  expect(JSON.parse(localStorage.getItem(storageKey)!)).toMatchObject({ theme: 'light', reducedMotion: true })
})
