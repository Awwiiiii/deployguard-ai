import { mergeConfig } from 'vite'
import config, { readOnlyApi } from './vite.config'

export default mergeConfig(config, {
  server: { port: 5175, proxy: Object.fromEntries(Object.entries(readOnlyApi).map(([path, options]) => [path, { ...options, target: 'http://127.0.0.1:8004' }])) },
})
