const { chromium } = require('playwright')
;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(900)

  await page.click('button:has-text("Live")')
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'shot-live-final.png' })

  // Teal theme check
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'teal'))
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'shot-teal-live.png' })

  // Scenes tab to prove existing panel reachable
  await page.evaluate(() => document.documentElement.removeAttribute('data-theme'))
  await page.click('button:has-text("Scenes")')
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'shot-scenes-final.png' })

  await browser.close()
  console.log('done')
})().catch((e) => { console.error(e); process.exit(1) })
