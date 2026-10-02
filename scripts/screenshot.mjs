/**
 * Screenshot dell'app per verifiche visive (desktop/tablet/mobile, tema chiaro/scuro).
 * Uso: node scripts/screenshot.mjs [baseUrl] [outDir] [pagine…]
 *   es. node scripts/screenshot.mjs http://localhost:4173 ./shots home agenda
 * Richiede Playwright (non è una dipendenza del progetto): PLAYWRIGHT_MODULE può indicarne il percorso.
 */
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright')

const [, , baseUrl = 'http://localhost:4173', outDir = './shots', ...pagesArg] = process.argv
const pages = pagesArg.length ? pagesArg : ['home', 'agenda', 'attivita', 'clienti', 'fondi', 'pratiche', 'impostazioni']
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 1024, height: 768 },
  { name: 'mobile', width: 390, height: 844 },
]
const themes = (process.env.THEMES ?? 'light,dark').split(',')

mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []
for (const theme of themes) {
  for (const vp of viewports) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      colorScheme: theme === 'dark' ? 'dark' : 'light',
      locale: 'it-IT',
      timezoneId: 'Europe/Rome',
      ignoreHTTPSErrors: true,
    })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => errors.push(`[${theme}/${vp.name}] pageerror: ${e.message}`))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`[${theme}/${vp.name}] console: ${m.text()}`)
    })
    for (const p of pages) {
      await page.goto(`${baseUrl}/#/${p === 'home' ? '' : p}`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(300)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      if (overflow > 1) errors.push(`[${theme}/${vp.name}] ${p}: overflow orizzontale di ${overflow}px`)
      await page.screenshot({ path: `${outDir}/${p}-${vp.name}-${theme}.png`, fullPage: true })
    }
    await ctx.close()
  }
}
await browser.close()
if (errors.length) {
  console.log('PROBLEMI:\n' + errors.join('\n'))
  process.exitCode = 1
} else {
  console.log('OK: nessun errore JS, nessun overflow orizzontale')
}
