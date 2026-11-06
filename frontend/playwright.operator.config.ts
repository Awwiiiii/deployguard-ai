import { defineConfig } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const db = process.env.DEPLOYGUARD_BROWSER_TEST_DB ?? resolve(root, '.pytest_tmp', `browser-operator-${randomUUID()}.sqlite3`)
process.env.DEPLOYGUARD_BROWSER_TEST_DB = db
const env = { DEPLOYGUARD_BROWSER_TEST_DB: db }
export default defineConfig({
  testDir: './e2e-operator', workers: 1, fullyParallel: false, retries: 0,
  reporter: 'list', timeout: 90_000, outputDir: 'test-results/operator',
  use: {
    baseURL: 'http://127.0.0.1:5175', headless: true, reducedMotion: 'reduce',
    // Synthetic test credential goes to the browser's native HTTP stack, never page JS.
    httpCredentials: { username: 'operator', password: 'test-only-credential-' + 'x'.repeat(32), origin: 'http://127.0.0.1:8003' },
    launchOptions: process.env.DEPLOYGUARD_TEST_BROWSER ? { executablePath: process.env.DEPLOYGUARD_TEST_BROWSER } : {},
    trace: 'off',
  },
  webServer: [
    { command: 'env -u DEPLOYGUARD_HUMAN_SECRET -u DEPLOYGUARD_DB ../.venv/bin/python -m uvicorn tests.browser_operator_stack:create_test_api --factory --app-dir .. --host 127.0.0.1 --port 8004 --no-access-log --no-proxy-headers', url: 'http://127.0.0.1:8004/version', env, reuseExistingServer: false },
    { command: 'env -u DEPLOYGUARD_HUMAN_SECRET -u DEPLOYGUARD_DB ../.venv/bin/python -m uvicorn tests.browser_operator_stack:create_test_operator --factory --app-dir .. --host 127.0.0.1 --port 8003 --no-access-log --no-proxy-headers', url: 'http://127.0.0.1:8003/availability', env, reuseExistingServer: false },
    { command: 'npm run dev -- --config vite.operator.qa.config.ts', url: 'http://127.0.0.1:5175', reuseExistingServer: false },
  ],
})
