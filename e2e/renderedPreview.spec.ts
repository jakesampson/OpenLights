import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const asyncValue = async () => null
    const api: Record<string, unknown> = {
      getWindowMaximized: async () => false,
      onWindowMaximized: () => () => {},
      onMenuCommand: () => () => {},
      getChannels: async () => Array(512).fill(0),
      listShows: async () => [],
      getDmxPorts: async () => [],
      getDmxStatus: async () => ({ mode: 'virtual', connected: false, port: null, frameCount: 0, lastFrameAt: null, universe: 1, error: null }),
      onLiveWindowState: () => () => {},
      onLiveWindowCommand: () => () => {},
      setChannels: () => {},
      publishLiveWindowState: () => {},
      requestLiveWindowState: () => {}
    }
    ;(window as any).electronAPI = new Proxy(api, { get: (target, property: string) => property in target ? target[property] : asyncValue })
  })
  await page.goto('http://127.0.0.1:4174')
})

test('clicks through core Design and Live operation', async ({ page }) => {
  await expect(page.getByText('Demo Show', { exact: false }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByLabel('Default fade milliseconds')).toBeVisible()
  await page.getByRole('button', { name: 'Settings' }).click()

  await page.locator('.view-switch').getByRole('button', { name: /Live/ }).click()
  await expect(page.getByLabel('Live playback')).toBeVisible()
  await page.locator('.bottom-edit').click()
  await expect(page.getByRole('dialog', { name: 'Edit Live page' })).toBeVisible()
  if (await page.getByText('Open Manage pages to create your first Live page.').isVisible()) {
    await page.getByRole('button', { name: 'Manage pages' }).click()
    await page.getByLabel('New Live page name').fill('Main')
    await page.getByRole('button', { name: '+ Add page' }).click()
    await page.getByRole('dialog', { name: 'Manage Live pages' }).getByRole('button', { name: 'Done' }).click()
  }
  await page.getByRole('button', { name: '+ Custom cue' }).click()
  await expect(page.getByText('New cue', { exact: true }).first()).toBeVisible()
  await page.getByRole('dialog', { name: 'Edit Live page' }).locator('header').getByRole('button', { name: 'Done' }).click()

  await page.getByRole('button', { name: 'Blind' }).click()
  await expect(page.getByText('BLIND · preview only')).toBeVisible()
  await page.getByRole('button', { name: 'Blind' }).click()
  await page.getByRole('button', { name: 'Freeze' }).click()
  await expect(page.getByRole('button', { name: 'Freeze' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Freeze' }).click()

  await page.locator('.bottom-edit').click()
  await page.getByLabel('Live page', { exact: true }).click({ button: 'right' })
  await expect(page.getByRole('menu', { name: 'page actions' })).toBeVisible()
  await page.screenshot({ path: '/tmp/openlights-rendered-preview.png', fullPage: true })
})
