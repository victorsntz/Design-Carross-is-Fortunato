import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true })
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } })
page.on('pageerror', (e) => console.log('EXCEPTION:', e.message))
await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
await page.waitForSelector('.sl-root')
await page.waitForTimeout(600)
// Slide 6 = Desenvolvimento 2
await page.locator('.thumb').nth(5).click()
await page.waitForTimeout(400)
const info = await page.evaluate(() => ({
  dots: document.querySelectorAll('.stepper-dots .dot').length,
  fs: getComputedStyle(document.querySelector('.preview-canvas .sl-final-text')).fontSize,
}))
console.log('D2:', JSON.stringify(info))
// desce até o mínimo
for (let i = 0; i < 8; i++) await page.locator('button:has-text("A−")').click().catch(() => {})
await page.waitForTimeout(300)
const min = await page.evaluate(() =>
  getComputedStyle(document.querySelector('.preview-canvas .sl-final-text')).fontSize,
)
console.log('mínimo D2:', min)
await browser.close()
if (info.dots !== 7) { console.log('esperava 7 pontinhos'); process.exit(1) }
console.log('QA D2 OK')
