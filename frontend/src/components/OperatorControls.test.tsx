import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { OperatorControls } from './OperatorControls'

function mount(origin = 'http://127.0.0.1:8003', available = true) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ available, authentication: 'browser-native-http-basic', console_origin: origin, monitor_enabled: true }), { headers: { 'content-type': 'application/json' } })))
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><OperatorControls incidentId="inc_test1234" /></QueryClientProvider>)
}
it('opens only the fixed, separate operator origin without a credential input', async () => {
  mount()
  const link = await screen.findByRole('link', { name: 'Open protected operator console' })
  expect(link).toHaveAttribute('href', 'http://127.0.0.1:8003/operator/incidents/inc_test1234')
  expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  expect(document.querySelector('input[type=password]')).toBeNull()
})
it('labels browser recovery unavailable when the gateway is unavailable', async () => {
  mount('http://127.0.0.1:8003', false)
  expect(await screen.findByRole('button', { name: 'Browser recovery unavailable' })).toBeDisabled()
  expect(screen.queryByRole('link', { name: 'Open protected operator console' })).not.toBeInTheDocument()
})
it('rejects a gateway discovery response naming an arbitrary destination', async () => {
  mount('https://attacker.invalid')
  expect(await screen.findByRole('button', { name: 'Browser recovery unavailable' })).toBeDisabled()
  expect(document.querySelector('a[href*="attacker"]')).toBeNull()
})
