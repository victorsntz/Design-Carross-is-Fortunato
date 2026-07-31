import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true })
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } })
page.on('pageerror', (e) => console.log('EXCEPTION:', e.message))
await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
await page.waitForSelector('.sl-root')
await page.waitForTimeout(600)
await page.locator('.thumb').nth(4).click()
await page.waitForTimeout(300)
const area = page.locator('.panel--slide textarea').first()
const errors = []

// frase inteira COM espaço no fim da seleção → sublinhado
await area.fill('vou sublinhar esta frase inteira agora mesmo')
await area.evaluate((el) => { el.focus(); el.setSelectionRange(4, 34) }) // "sublinhar esta frase inteira " (com espaço)
await page.keyboard.press('Control+U')
await page.waitForTimeout(300)
const v1 = await area.inputValue()
console.log('U em frase:', JSON.stringify(v1))
if (!v1.includes('_sublinhar esta frase inteira_')) errors.push('sublinhado de frase falhou')
const rendered = await page.evaluate(() => document.querySelectorAll('.preview-canvas u').length)
if (rendered !== 1) errors.push(`<u> não renderizou (${rendered})`)

// negrito em frase com espaço na frente
await area.fill('destaque toda esta parte em negrito no slide')
await area.evaluate((el) => { el.focus(); el.setSelectionRange(8, 35) }) // " toda esta parte em negrito"
await page.keyboard.press('Control+B')
await page.waitForTimeout(300)
const v2 = await area.inputValue()
console.log('B em frase:', JSON.stringify(v2))
if (!v2.includes('**toda esta parte em negrito**')) errors.push('negrito de frase falhou')
const strong = await page.evaluate(() => document.querySelectorAll('.preview-canvas strong')?.length)
if (strong < 1) errors.push('<strong> não renderizou')

await browser.close()
if (errors.length) { console.log('PROBLEMAS:', errors.join(' | ')); process.exit(1) }
console.log('QA FRASES OK')
