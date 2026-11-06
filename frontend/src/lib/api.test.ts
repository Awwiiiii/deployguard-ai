import { expect, it, vi } from 'vitest'
import { get } from './api'
it('rejects a successful HTML fallback instead of treating it as backend data', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>fallback</html>', { headers: { 'content-type': 'text/html' } })))
  await expect(get('/status')).rejects.toThrow('Expected API JSON')
})
it('reports a missing status endpoint with backend restart guidance', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  await expect(get('/status')).rejects.toThrow('restart the updated backend')
})
