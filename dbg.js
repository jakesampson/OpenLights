const { chromium } = require('playwright')
;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)

  const info = await page.evaluate(() => {
    const out = []
    const btns = Array.from(document.querySelectorAll('.bottom-grid button'))
    for (const b of btns) {
      const r = b.getBoundingClientRect()
      const cs = getComputedStyle(b)
      out.push({
        text: b.textContent?.trim(),
        cls: b.className,
        w: Math.round(r.width),
        h: Math.round(r.height),
        color: cs.color,
        bg: cs.backgroundColor,
        fontSize: cs.fontSize,
        lineHeight: cs.lineHeight,
        overflow: cs.overflow,
        display: cs.display
      })
    }
    return out
  })
  console.log(JSON.stringify(info, null, 2))
  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
