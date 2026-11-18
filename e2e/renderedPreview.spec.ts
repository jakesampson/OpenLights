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
  await page.goto('http://127.0.0.1:4180')
})

test('clicks through core Design and Live operation', async ({ page }) => {
  await expect(page.getByText('Demo Show', { exact: false }).first()).toBeVisible()
  await expect(page.locator('.top-bar')).toHaveCount(1)
  await expect(page.locator('.top-bar').getByLabel('Active cue')).toBeVisible()
  await expect(page.locator('.top-bar').getByLabel('Master intensity')).toHaveCount(0)
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByLabel('Default fade milliseconds')).toBeVisible()
  await page.locator('.stage').click({ position: { x: 20, y: 20 } })
  await expect(page.getByLabel('Default fade milliseconds')).toBeHidden()

  await page.getByRole('button', { name: 'Lock project' }).click()
  await expect(page.getByRole('dialog', { name: 'Lock OpenLights' })).toBeVisible()
  await page.getByLabel('Optional lock PIN').fill('2468')
  await page.getByRole('dialog', { name: 'Lock OpenLights' }).getByRole('button', { name: 'Lock', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Unlock project' })).toBeVisible()
  await page.getByRole('button', { name: 'Unlock project' }).click()
  await page.getByLabel('Unlock PIN').fill('wrong')
  await page.getByRole('dialog', { name: 'Unlock OpenLights' }).getByRole('button', { name: 'Unlock', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Incorrect PIN')
  await page.getByLabel('Unlock PIN').fill('2468')
  await page.getByRole('dialog', { name: 'Unlock OpenLights' }).getByRole('button', { name: 'Unlock', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Lock project' })).toBeVisible()
  await page.locator('.view-switch').getByRole('button', { name: 'Design' }).click()
  await page.locator('.top-bar details > summary').filter({ hasText: 'Edit' }).click()
  await expect(page.getByRole('button', { name: /Undo/ })).toBeVisible()
  await page.locator('.stage').click({ position: { x: 20, y: 20 } })
  await expect(page.getByRole('button', { name: /Undo/ })).toBeHidden()
  await page.getByRole('button', { name: 'Patch fixtures' }).click()
  await expect(page.getByRole('dialog', { name: 'Patch' })).toBeVisible()
  await page.getByRole('dialog', { name: 'Patch' }).getByRole('button', { name: 'Close' }).click()

  await page.locator('.stage').getByRole('button', { name: 'Warm Wash Front' }).click()
  await expect(page.getByText('1 fixture selected')).toBeVisible()
  await page.locator('summary[aria-label="Fixture property menu"]').click()
  await expect(page.getByRole('button', { name: 'Copy Properties' })).toBeVisible()
  await expect(page.locator('.property-menu summary').filter({ hasText: 'Copy Property' })).toBeVisible()
  await page.locator('.property-menu summary').filter({ hasText: 'Select Property' }).click()
  await expect(page.locator('.header-submenu').first()).toBeVisible()
  await page.locator('.stage').click({ position: { x: 20, y: 200 } })
  await expect(page.getByRole('button', { name: 'Copy Properties' })).toBeHidden()
  await expect(page.locator('.header-submenu').first()).toBeHidden()
  await page.locator('summary[aria-label="Add effect"]').click()
  await expect(page.getByText('Add Effect for:', { exact: true })).toBeVisible()
  await page.locator('.stage').click({ position: { x: 20, y: 200 } })
  await expect(page.getByText('Add Effect for:', { exact: true })).toBeHidden()
  await page.getByLabel('Preset palette sidebar').click({ button: 'right', position: { x: 20, y: 20 } })
  await expect(page.getByRole('menu', { name: 'Preset palette actions' })).toBeVisible()
  await page.locator('.stage').click({ position: { x: 20, y: 200 } })
  await expect(page.getByRole('menu', { name: 'Preset palette actions' })).toBeHidden()
  expect(await page.locator('.design-fixture-inspector').evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true)
  await expect(page.locator('.bottom-grid').getByLabel('Master output')).toHaveCount(0)
  await expect(page.locator('.bottom-grid').getByText('Edit cue', { exact: true })).toHaveCount(0)
  await expect(page.locator('.bottom-grid').locator('#design-cue')).toHaveCount(0)

  await page.locator('.view-switch').getByRole('button', { name: /Live/ }).click()
  await expect(page.getByLabel('Live page canvas')).toBeVisible()
  await expect(page.getByLabel('Live page canvas').getByRole('button', { name: 'Manage pages' })).toHaveCount(0)
  await expect(page.getByLabel('Live page canvas').getByLabel('Live page', { exact: true })).toHaveCount(0)
  await expect(page.locator('.bottom-grid').getByLabel('Master output')).toHaveCount(0)
  await expect(page.locator('.bottom-grid').getByLabel('Cue buttons')).toHaveCount(0)
  await page.locator('.live-page-edit').click()
  await expect(page.getByLabel('page inspector')).toHaveCount(0)
  const canvasViewport = page.getByLabel('Live canvas viewport')
  expect(await canvasViewport.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true)
  expect(await canvasViewport.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.getByRole('button', { name: 'New button' }).click()
  await expect(page.getByRole('button', { name: /New cue/ }).first()).toBeVisible()
  await page.locator('.live-page-edit').click()
  await page.locator('.view-switch').getByRole('button', { name: 'Live pages' }).click()
  await expect(page.getByRole('menu', { name: 'Live pages' })).toBeVisible()
  await page.getByRole('menu', { name: 'Live pages' }).getByRole('menuitem', { name: /Page 1/ }).click()
  await page.locator('.view-switch').getByRole('button', { name: 'Live pages' }).click()
  await page.getByRole('menu', { name: 'Live pages' }).getByRole('menuitem', { name: 'Manage Live Pages…' }).click()
  await expect(page.getByRole('dialog', { name: 'Manage Live Pages' })).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()

  await page.getByRole('button', { name: 'Blind' }).click()
  await expect(page.getByText('BLIND · preview only')).toBeVisible()
  await page.getByRole('button', { name: 'Blind' }).click()
  await page.getByRole('button', { name: 'Freeze' }).click()
  await expect(page.getByRole('button', { name: 'Freeze' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Freeze' }).click()

  await page.locator('.live-page-edit').click()
  await page.getByLabel('Live canvas viewport').click({ button: 'right', position: { x: 120, y: 20 } })
  await expect(page.getByRole('menu', { name: 'Live edit actions' })).toBeVisible()
  await page.screenshot({ path: '/tmp/openlights-rendered-preview.png', fullPage: true })
})
