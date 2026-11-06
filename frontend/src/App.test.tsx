import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import App from './App'
import { ToastProvider } from './components/ui'
import { PreferencesProvider } from './lib/preferences'
import { events, incident, snapshot } from './test/fixtures'
import type { Snapshot } from './lib/types'

function mount(path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  render(<QueryClientProvider client={client}><PreferencesProvider><MemoryRouter initialEntries={[path]}><ToastProvider><App /></ToastProvider></MemoryRouter></PreferencesProvider></QueryClientProvider>)
  return client
}
function mockApi(hasIncident = true, status: Snapshot = snapshot) {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input)
    const data = path === '/api/status' ? status
      : path === '/api/incidents' ? { incidents: hasIncident ? [incident] : [] }
        : path === '/api/deployments' ? { active_deployment: snapshot.active_deployment, deployments: [snapshot.active_deployment] }
          : path === `/api/incidents/${incident.id}` ? { incident }
            : path === '/api/audit' ? { events: hasIncident ? events : [] } : null
    return new Response(JSON.stringify(data), { status: data ? 200 : 404, headers: { 'Content-Type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetcher)
  return fetcher
}
it('shows loading while real data is pending', () => {
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
  mount()
  expect(screen.getByRole('status', { name: 'Loading operational data' })).toBeInTheDocument()
})
it('uses read-only endpoints and keeps unobserved health honest', async () => {
  const fetcher = mockApi()
  mount()
  expect(await screen.findByRole('heading', { name: 'Command center' })).toBeInTheDocument()
  expect(screen.getAllByText('Unobserved').length).toBeGreaterThan(0)
  expect(screen.getByText('ValueError in /checkout')).toBeInTheDocument()
  expect(fetcher.mock.calls.map(c => c[0])).toEqual(expect.arrayContaining(['/api/status', '/api/incidents', '/api/deployments', '/api/audit']))
  expect(fetcher.mock.calls.some(c => /health|checkout/.test(String(c[0])))).toBe(false)
})
it('shows the honest empty state without fixture incidents', async () => {
  mockApi(false); mount('/incidents')
  expect(await screen.findByText('No incidents recorded')).toBeInTheDocument()
  expect(screen.queryByText('ValueError in /checkout')).not.toBeInTheDocument()
})
it('filters real incident records by status and search', async () => {
  mockApi(); mount('/incidents')
  expect(await screen.findByText('ValueError in /checkout')).toBeInTheDocument()
  fireEvent.change(screen.getByRole('textbox', { name: 'Search incidents' }), { target: { value: 'nonexistent' } })
  expect(screen.getByText('No incidents match your filters')).toBeInTheDocument()
  fireEvent.change(screen.getByRole('textbox', { name: 'Search incidents' }), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: /Resolved\s*0/ }))
  expect(screen.getByText('No incidents match your filters')).toBeInTheDocument()
})
it('opens actual evidence without marking it investigated', async () => {
  const fetcher = mockApi(); mount(`/incidents/${incident.id}`)
  expect(await screen.findByText('Traceback: test fixture only')).toBeInTheDocument()
  expect(screen.getByText('Investigation has not been recorded')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Copy investigation brief' })).toBeInTheDocument()
  expect(fetcher.mock.calls.every(c => !String(c[0]).includes('/report'))).toBe(true)
})
it('provides an explicit CLI recovery runbook without issuing browser mutations', async () => {
  const fetcher = mockApi(); mount('/recovery')
  expect(await screen.findByText('No rollback recorded for this incident')).toBeInTheDocument()
  expect(screen.getAllByText('Not run')).toHaveLength(5)
  fireEvent.click(screen.getByRole('button', { name: 'Open operator runbook' }))
  expect(screen.getByRole('dialog', { name: 'Human operator runbook' })).toBeInTheDocument()
  expect(screen.getByText(/tools\/approve.py/)).toHaveTextContent(incident.id)
  expect(fetcher.mock.calls.map(c => c[0])).toContain('/api/operator-status')
  expect(screen.getAllByText('Browser recovery unavailable').length).toBeGreaterThan(0)
})
it('shows failed verification as failed, using the actual check booleans', async () => {
  mockApi(true, { ...snapshot, recoveries: [{ id: 'rec_test', incident_id: incident.id, approval_id: 'apr_test', previous_version: 'v1.1.0', target_version: 'v1.0.0', deployment_id: 'dep_target', executed_at: incident.timestamp, verified_at: null,
    verification: { status: 'verification_failed', incident_id: incident.id, recovery_id: 'rec_test', checks: { version: true, health: false, checkout: true, audit: true, persisted_deployment: true }, evidence: {} } }] })
  mount('/recovery')
  expect(await screen.findByText('Verification failed')).toBeInTheDocument()
  expect(screen.getByText('Health endpoint passes').closest('.verification-row')).toHaveTextContent('Failed')
  expect(screen.getAllByText('Passed')).toHaveLength(4)
  expect(screen.queryByText('Verified')).not.toBeInTheDocument()
})
it('makes backend failure visible without substituting live data', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Connection refused') }))
  mount()
  expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent('Backend connection interrupted')
  expect(screen.getByText(/No demonstration data is substituted/)).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Command center' })).not.toBeInTheDocument()
})
it('supports keyboard command navigation', async () => {
  mockApi(); mount()
  await screen.findByRole('heading', { name: 'Command center' })
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
  expect(screen.getByRole('dialog', { name: 'Search command center' })).toBeInTheDocument()
  fireEvent.change(screen.getByRole('textbox', { name: 'Search pages and incidents' }), { target: { value: 'agents' } })
  fireEvent.click(screen.getByRole('button', { name: 'Agents' }))
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Agent collaboration' })).toBeInTheDocument())
})
