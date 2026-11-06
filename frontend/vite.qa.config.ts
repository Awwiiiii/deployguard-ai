import { mergeConfig } from 'vite'
import config, { readOnlyApi } from './vite.config'

// QA uses a second real FastAPI process; the existing demo on 8001 is untouched.
// The browser cannot select the destination. This fixed target is test tooling only.
export default mergeConfig(config, {
  server: { port: 5174, proxy: Object.fromEntries(Object.entries(readOnlyApi).map(([path, options]) => [path, { ...options, target: 'http://127.0.0.1:8002' }])) },
})
