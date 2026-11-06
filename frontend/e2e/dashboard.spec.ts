import { expect, test } from '@playwright/test'

const pages = [
  ['/', 'Command center'], ['/incidents', 'Incidents'], ['/recovery', 'Recovery center'],
  ['/activity', 'Activity'], ['/agents', 'Agent collaboration'], ['/settings', 'Settings'],
]
for (const theme of ['dark', 'light']) {
  for (const viewport of [{ width: 1440, height: 1100 }, { width: 390, height: 844 }, { width: 768, height: 1024 }]) {
    test(`${theme} · ${viewport.width}px · all six real API pages`, async ({ page }, info) => {
      await page.setViewportSize(viewport)
      await page.addInitScript(theme => localStorage.setItem('deployguard.preferences.v1', JSON.stringify({ theme, reducedMotion: true })), theme)
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      for (const [path, heading] of pages) {
        await page.goto(path)
        await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
        await expect(page.locator('.connection-status')).toContainText('Backend connected')
        await page.evaluate(() => document.fonts.ready)
        const overflow = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
          elements: [...document.querySelectorAll('body *')].filter(el => { const r = el.getBoundingClientRect(); return r.right > innerWidth + 1 && r.left >= 0 && getComputedStyle(el).position !== 'absolute' }).slice(0, 15).map(el => ({ tag: el.tagName, className: el.getAttribute('class'), right: el.getBoundingClientRect().right })) }))
        expect(overflow.scrollWidth, JSON.stringify({ path, ...overflow })).toBeLessThanOrEqual(overflow.width)
        if (path === '/') await page.screenshot({ path: info.outputPath(`overview-${theme}-${viewport.width}.png`), fullPage: true })
        if (path === '/settings') await page.screenshot({ path: info.outputPath(`settings-${theme}-${viewport.width}.png`), fullPage: true })
      }
      expect(errors).toEqual([])
    })
  }
}
test('actual incident evidence and CLI-only recovery', async ({ page }) => {
  await page.goto('/incidents')
  await expect(page.getByRole('heading', { name: 'Incidents', exact: true })).toBeVisible()
  const incidents = (await (await page.request.get('/api/incidents')).json()).incidents
  if (incidents.length) {
    await page.goto(`/incidents/${incidents[0].id}`)
    await expect(page.getByRole('heading', { name: `${incidents[0].evidence.error_type} in ${incidents[0].evidence.endpoint}`, exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Copy investigation brief' })).toBeVisible()
    await expect(page.locator('.traceback')).toContainText(incidents[0].evidence.traceback.trim())
  }
  const mutationRequests: string[] = []
  page.on('request', req => { if (req.url().includes('/api/') && req.method() !== 'GET') mutationRequests.push(req.url()) })
  await page.goto('/recovery')
  await page.getByRole('button', { name: 'Open operator runbook' }).click()
  await expect(page.getByRole('dialog', { name: 'Human operator runbook' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  expect(mutationRequests).toEqual([])
})
test('browser proxy rejects mutation attempts without changing state', async ({ request }) => {
  const before = await (await request.get('/api/status')).json()
  for (const path of ['/api/status', '/api/incidents', '/api/deployments', '/api/audit', '/api/operator-status']) {
    const response = await request.post(path, { data: { incident_id: 'fake', target: 'v1.0.0' } })
    expect(response.status()).toBe(405)
  }
  for (const path of ['/api/approve', '/api/rollback', '/api/checkout', '/api/health', '/api/operator/rollback']) {
    expect((await request.post(path, { data: {} })).status()).toBe(404)
  }
  const after = await (await request.get('/api/status')).json()
  expect(after).toEqual(before)
})
test('loading and disconnected states are visible and settings remain usable', async ({ page }) => {
  await page.route('**/api/**', async route => { await new Promise(resolve => setTimeout(resolve, 1500)); await route.continue() })
  await page.goto('/')
  await expect(page.getByRole('status', { name: 'Loading operational data' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Command center', exact: true })).toBeVisible()
  await page.unroute('**/api/**')
  await page.route('**/api/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"QA connection failure"}' }))
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('Backend connection interrupted')
  await expect(page.getByText(/No demonstration data is substituted/)).toBeVisible()
  await page.getByRole('link', { name: 'Connection settings', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Connections', exact: true })).toBeVisible()
})
test('keyboard navigation, theme selection and reduced motion', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Command center', exact: true })).toBeVisible()
  await page.keyboard.press('Control+k')
  const dialog = page.getByRole('dialog', { name: 'Search command center' })
  await expect(dialog).toBeVisible()
  await page.getByRole('textbox', { name: 'Search pages and incidents' }).fill('Settings')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Light', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('switch', { name: 'Reduce motion', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced')
  expect(await page.locator('.flow-particle').count()).toBe(0)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
  await expect(page.getByRole('complementary', { name: 'Main navigation' })).toHaveClass(/mobile-open/)
  await page.locator('.mobile-close').click()
})
