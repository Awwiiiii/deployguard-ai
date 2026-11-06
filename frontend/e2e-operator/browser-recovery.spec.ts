import { expect, test } from '@playwright/test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

test('website-first: real release failure, native authentication, scoped approval, rollback, five checks and audit', async ({ page, context }, info) => {
  await page.addInitScript(() => localStorage.setItem('deployguard.preferences.v1', JSON.stringify({ refreshInterval: 5, reducedMotion: true })))
  const leakedAuth: string[] = []
  const headerChecks: Promise<void>[] = []
  const headerErrors: string[] = []
  const inspectResponse = (response: import('@playwright/test').Response) => {
    const request = response.request()
    if (new URL(request.url()).port === '5175') headerChecks.push(request.allHeaders().then(headers => { if (headers['authorization']) leakedAuth.push(request.url()) }).catch(() => { headerErrors.push('Completed request headers unavailable') }))
  }
  page.on('response', inspectResponse)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:5175' })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Command center', exact: true })).toBeVisible()
  await expect(page.locator('.metric-value').first()).toContainText('Healthy', { timeout: 15_000 })
  // The only terminal operation during the demo: the existing fault-activation tool.
  await promisify(execFile)('../.venv/bin/python', ['../tools/reset_demo.py', '--db', process.env.DEPLOYGUARD_BROWSER_TEST_DB!], { env: { PATH: process.env.PATH ?? '/usr/bin:/bin' } })
  // No checkout/health request from the test browser: the monitor detects the release.
  await expect(page.locator('.metric-value').first()).toContainText('Degraded', { timeout: 20_000 })
  await expect(page.getByText('ValueError in /health', { exact: true })).toBeVisible()
  const incidents = (await (await page.request.get('/api/incidents')).json()).incidents
  const incident = incidents[0]
  expect(incident.observation_count).toBe(1)
  await page.getByText('ValueError in /health', { exact: true }).click()
  await expect(page.locator('.traceback')).toContainText('invalid-price')
  await page.getByRole('button', { name: 'Copy investigation brief', exact: true }).click()
  const brief = await page.evaluate(() => navigator.clipboard.readText())
  expect(brief).toContain(incident.id)
  expect(brief).toContain(incident.evidence.traceback.trim())
  expect(brief).not.toContain('test-only-credential')
  await page.getByRole('link', { name: 'Review recovery', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Recovery center', exact: true })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Select incident for recovery' })).toHaveValue(incident.id)
  await expect(page.getByText('Gateway connected', { exact: true })).toBeVisible()
  const popupPromise = page.waitForEvent('popup')
  await page.getByRole('link', { name: 'Open protected operator console', exact: true }).click()
  const operator = await popupPromise
  await expect(operator.getByRole('heading', { name: 'Review and authorize recovery' })).toBeVisible()
  expect(new URL(operator.url()).port).toBe('8003')
  await expect(operator.locator('input[type="password"]')).toHaveCount(0)
  await expect(operator.locator('script')).toHaveCount(0)
  expect(await operator.locator('body').innerText()).not.toContain('test-only-credential')
  expect(await operator.evaluate(() => document.cookie)).not.toContain('dg_operator_session')
  await operator.setViewportSize({ width: 390, height: 844 })
  expect(await operator.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await operator.screenshot({ path: info.outputPath('operator-review-mobile.png'), fullPage: true })
  await operator.getByRole('checkbox', { name: 'I reviewed the failure, deployment, and proposed rollback.' }).check()
  const nativeForm = operator.waitForRequest(request => request.method() === 'POST' && request.url().endsWith('/approve'))
  await operator.getByRole('button', { name: 'Issue scoped approval', exact: true }).click()
  const submitted = await nativeForm
  const nativeHeaders = await submitted.allHeaders()
  expect(nativeHeaders['origin']).toBe('http://127.0.0.1:8003')
  expect(nativeHeaders['sec-fetch-site']).toBe('same-origin')
  await expect(operator.getByRole('button', { name: 'Execute approved rollback', exact: true })).toBeVisible()
  await expect(operator.locator('body')).toContainText(incident.id)
  await operator.getByRole('textbox', { name: /Type ROLLBACK/ }).fill('ROLLBACK')
  await operator.getByRole('button', { name: 'Execute approved rollback', exact: true }).click()
  await expect(operator.getByRole('heading', { name: 'Verified', exact: true })).toBeVisible()
  await expect(operator.getByText('Passed', { exact: true })).toHaveCount(5)
  expect(await operator.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await operator.screenshot({ path: info.outputPath('operator-verified-mobile.png'), fullPage: true })
  await page.bringToFront()
  await expect(page.getByText('Verified', { exact: true })).toBeVisible({ timeout: 12_000 })
  await expect(page.getByText('Passed', { exact: true })).toHaveCount(5)
  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  await expect(page.locator('.metric-value').first()).toContainText('Healthy')
  await expect(page.locator('.metric-value').nth(1)).toContainText('v1.0.0')
  await page.getByRole('link', { name: 'Activity', exact: true }).click()
  await expect(page.getByText('Approval issued', { exact: true })).toBeVisible()
  await expect(page.getByText('Rollback executed', { exact: true })).toBeVisible()
  await expect(page.getByText('Recovery verified', { exact: true })).toBeVisible()
  const snapshot = await (await page.request.get('/api/status')).json()
  expect(snapshot.recoveries).toHaveLength(1)
  expect(snapshot.approvals[0].consumed_at).toBeTruthy()
  expect(Object.values(snapshot.recoveries[0].verification.checks)).toEqual([true, true, true, true, true])
  page.off('response', inspectResponse)
  await Promise.all(headerChecks)
  expect(headerErrors).toEqual([])
  expect(leakedAuth).toEqual([])
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('test-only-credential')
})

test('cross-origin dashboard scripts cannot call protected operator mutations', async ({ page }) => {
  await page.goto('/recovery')
  const result = await page.evaluate(async () => {
    try {
      const response = await fetch('http://127.0.0.1:8003/operator/incidents/inc_fake/approve', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'csrf_token=forged&reviewed=yes' })
      return response.status
    } catch { return 'blocked' }
  })
  expect(result).toBe('blocked')
})
