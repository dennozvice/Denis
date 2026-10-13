/**
 * Screenshot dell'iPod per verifiche visive (desktop/telefono, argento/nero, con brani dimostrativi).
 * Uso: node scripts/screenshot.mjs [baseUrl] [outDir]
 *   es. npm run preview & node scripts/screenshot.mjs http://localhost:4173 ./shots
 * Richiede Playwright (non è una dipendenza del progetto): PLAYWRIGHT_MODULE può indicarne il percorso.
 * Tastiera: frecce = ghiera, Invio = centro, Esc = MENU, Spazio = play.
 */
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright')

const [, , baseUrl = 'http://localhost:4173', outDir = './shots'] = process.argv
mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []

async function session(name, viewport, dpr, run) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dpr, locale: 'it-IT', hasTouch: dpr === 3 })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`[${name}] pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${name}] console: ${m.text()}`)
  })
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2800) // sequenza di accensione
  await run(page, async (keys, delay = 120) => {
    for (const k of keys) {
      await page.keyboard.press(k)
      await page.waitForTimeout(delay)
    }
  })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (overflow > 1) errors.push(`[${name}] overflow orizzontale di ${overflow}px`)
  await ctx.close()
}

const shot = (page, name, selector = '.ipod-window') => page.locator(selector).screenshot({ path: `${outDir}/${name}.png` })

await session('desktop', { width: 1440, height: 900 }, 2, async (page, keys) => {
  await page.screenshot({ path: `${outDir}/pagina-desktop.png` })
  await shot(page, 'menu-principale')
  // Brani dimostrativi → Musica → Album → primo album → primo brano
  await page.getByRole('button', { name: /dimostrativi/ }).click()
  await page.waitForFunction(() => document.querySelector('.sync-title')?.textContent?.includes('scollegare'), null, { timeout: 180000 })
  await shot(page, 'sincronizzazione-completata')
  await keys(['Enter', 'Enter'])
  await shot(page, 'menu-musica')
  await keys(['ArrowDown', 'ArrowDown', 'ArrowDown', 'Enter', 'ArrowDown', 'Enter'])
  await shot(page, 'album')
  await keys(['Enter'])
  await page.waitForTimeout(1200)
  await shot(page, 'in-riproduzione')
  await shot(page, 'ipod-in-riproduzione', '.ipod')
  await keys(['Escape', 'Escape', 'Escape', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'Enter'])
  await page.waitForTimeout(500)
  await shot(page, 'cover-flow')
})

await session('telefono', { width: 390, height: 844 }, 3, async (page) => {
  await page.screenshot({ path: `${outDir}/pagina-telefono.png` })
})

await session('nero', { width: 1440, height: 900 }, 2, async (page) => {
  await page.getByRole('button', { name: 'Nero' }).click()
  await page.waitForTimeout(300)
  await shot(page, 'ipod-nero', '.ipod')
})

await browser.close()
if (errors.length) {
  console.log('PROBLEMI:\n' + errors.join('\n'))
  process.exitCode = 1
} else {
  console.log('OK: nessun errore JS, nessun overflow orizzontale')
}
