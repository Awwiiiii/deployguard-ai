import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

// Only known read-only resources are proxied. Never proxy checkout or arbitrary paths.
export const readOnlyApi = {
  '^/api/(status|version|incidents(?:/[^/?]+)?|deployments|audit)(?:\\?.*)?$': {
    target: 'http://127.0.0.1:8001',
    changeOrigin: false,
    rewrite: (path: string) => path.replace(/^\/api/, ''),
  },
}
const operatorAvailability = {
  '^/api/operator-status$': {
    target: 'http://127.0.0.1:8003', changeOrigin: true, xfwd: false,
    rewrite: () => '/availability',
  },
}

function apiBoundary(): Plugin {
  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/')) { next(); return }
    const validPath = /^\/api\/(status|version|incidents(?:\/[a-zA-Z0-9_-]+)?|deployments|audit|operator-status)(?:\?.*)?$/.test(req.url)
    if (!['GET', 'HEAD'].includes(req.method ?? '') || !validPath) {
      res.statusCode = validPath ? 405 : 404
      res.setHeader('Content-Type', 'application/json')
      if (validPath) res.setHeader('Allow', 'GET, HEAD')
      res.end(JSON.stringify({ error: { code: 'read_only_interface', message: 'Only allowlisted read-only API requests are supported.' } }))
      return
    }
    next()
  }
  return { name: 'deployguard-read-only-api', configureServer(server) { server.middlewares.use(middleware) }, configurePreviewServer(server) { server.middlewares.use(middleware) } }
}

export default defineConfig({
  plugins: [apiBoundary(), react(), tailwindcss()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { ...readOnlyApi, ...operatorAvailability } },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true, proxy: { ...readOnlyApi, ...operatorAvailability } },
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], css: false, include: ['src/**/*.test.{ts,tsx}'] },
})
