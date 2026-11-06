import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1, retries: 0,
  reporter: 'list', timeout: 45_000,
  use: {
    baseURL: 'http://127.0.0.1:5174', headless: true, reducedMotion: 'reduce',
    launchOptions: process.env.DEPLOYGUARD_TEST_BROWSER ? { executablePath: process.env.DEPLOYGUARD_TEST_BROWSER } : {},
    trace: 'retain-on-failure',
  },
  webServer: [
    { command: 'env -u DEPLOYGUARD_HUMAN_SECRET -u DEPLOYGUARD_DB ../.venv/bin/python -m uvicorn app.main:app --app-dir .. --host 127.0.0.1 --port 8002', url: 'http://127.0.0.1:8002/version', reuseExistingServer: false },
    { command: 'npm run dev -- --config vite.qa.config.ts', url: 'http://127.0.0.1:5174', reuseExistingServer: false },
  ],
})
