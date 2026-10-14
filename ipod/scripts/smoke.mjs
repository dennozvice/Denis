/**
 * Prova end-to-end dell'iPod con Chromium (Playwright): brani dimostrativi, navigazione da tastiera,
 * riproduzione, Cover Flow, Extra, importazione di file veri tramite il selettore, persistenza.
 * Uso: npm run build && npm run preview &  node --experimental-strip-types scripts/smoke.mjs http://localhost:4173
 * Richiede Playwright (non è una dipendenza del progetto): PLAYWRIGHT_MODULE può indicarne il percorso.
 * Il flag --experimental-strip-types serve per generare i file WAV di prova con src/library/wav.ts.
 */
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { encodeWav } from '../src/library/wav.ts'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const [, , baseUrl = 'http://localhost:4173'] = process.argv

const failures = []
const check = (cond, msg, detail) => {
  if (!cond) failures.push(msg + (detail !== undefined ? ` (${JSON.stringify(detail)})` : ''))
  console.log(`${cond ? 'ok ' : 'KO '} ${msg}${!cond && detail !== undefined ? ' → ' + JSON.stringify(detail) : ''}`)
}

// File WAV con tag ID3 (titoli con accenti nei tag; nomi file ASCII: Playwright non passa nomi non ASCII al selettore)
const dir = mkdtempSync(join(tmpdir(), 'ipod-smoke-'))
const sr = 8000
const tone = (freq, sec) => {
  const n = sr * sec
  const l = new Float32Array(n)
  for (let i = 0; i < n; i++) l[i] = Math.sin((2 * Math.PI * freq * i) / sr) * 0.3 * Math.min(1, i / 400, (n - i) / 400)
  return [l, l]
}
writeFileSync(join(dir, '01 citta.wav'), encodeWav(tone(440, 3), sr, { title: 'Città vuota', artist: 'Mina', album: 'Studio Uno', year: 1963, trackNo: 1, trackOf: 2, genre: 'Pop' }))
writeFileSync(join(dir, '02 uomo.wav'), encodeWav(tone(523, 3), sr, { title: "È l'uomo per me", artist: 'Mina', album: 'Studio Uno', year: 1963, trackNo: 2, trackOf: 2, genre: 'Pop' }))
writeFileSync(join(dir, 'note.txt'), 'non audio')

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'it-IT' })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
// salta la scelta della lingua della prima accensione
await page.addInitScript(() => {
  try {
    localStorage.setItem('ipod:settings', JSON.stringify({ welcomed: true }))
  } catch {
    /* ignorato */
  }
})
const keys = async (list, delay = 120) => {
  for (const k of list) {
    await page.keyboard.press(k)
    await page.waitForTimeout(delay)
  }
}
const title = () => page.evaluate(() => document.querySelector('.sb-title')?.textContent?.trim())
// Le righe si leggono a transizione finita (220 ms): durante lo scorrimento ci sono due schermate.
const rows = async () => {
  await page.waitForTimeout(300)
  return page.evaluate(() => [...document.querySelectorAll('.row-label')].map((e) => e.textContent.trim()))
}
const selected = () => page.evaluate(() => document.querySelector('.row[data-sel="true"] .row-label')?.textContent?.trim())
const waitSyncDone = () => page.waitForFunction(() => /scollegare|annullata/.test(document.querySelector('.sync-title')?.textContent ?? ''), null, { timeout: 180000 })

await page.goto(baseUrl, { waitUntil: 'networkidle' })
await page.waitForTimeout(2800)
check((await title()) === 'iPod', 'accensione sul menu principale')

// Brani dimostrativi
await page.getByRole('button', { name: /dimostrativi/ }).click()
await waitSyncDone()
check((await page.evaluate(() => document.querySelector('.sync-body')?.textContent)) === '10 brani aggiunti', 'dieci brani dimostrativi importati')
await keys(['Enter'])

// Musica → Album → secondo album → primo brano
await keys(['Enter', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'Enter'])
check((await title()) === 'Album', 'lista Album')
await keys(['ArrowDown', 'Enter', 'Enter'])
await page.waitForTimeout(1500)
check((await title()) === 'In riproduzione', 'In riproduzione dopo la scelta di un brano')
check(await page.evaluate(() => !!document.querySelector('.sb-left svg')), 'icona play nella barra di stato')
// volume con la ghiera, poi scorrimento e valutazione con il tasto centrale
await keys(['ArrowDown'])
check(await page.evaluate(() => !!document.querySelector('.np-speaker')), 'barra del volume ruotando la ghiera')
await page.waitForTimeout(1700)
await keys(['Enter'])
check(await page.evaluate(() => !!document.querySelector('.np-diamond')), 'modalità scorrimento (rombo)')
await keys(['Enter'])
check(await page.evaluate(() => !!document.querySelector('.np-rating')), 'modalità valutazione')
await keys(['Enter', 'ArrowRight'])
await page.waitForTimeout(800)
check((await page.evaluate(() => document.querySelector('.np-counter span')?.textContent)) === '2 di 3', 'brano successivo con ⏭')
await keys(['Escape', 'Escape', 'Escape'])
check((await title()) === 'Musica', 'MENU torna indietro fino al menu Musica')

// Cover Flow
await keys(['ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'Enter'])
await page.waitForTimeout(500)
check((await title()) === 'Cover Flow', 'Cover Flow')
check((await page.evaluate(() => document.querySelectorAll('.cf-cover').length)) >= 3, 'copertine nel carosello')
await keys(['Enter'])
await page.waitForTimeout(500)
check(await page.evaluate(() => !!document.querySelector('.cf-track')), 'retro della copertina con i brani')
await keys(['Escape', 'Escape'])

// Extra: Orologi e Cronometro
await keys(['Escape', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'Enter', 'Enter'])
await page.waitForTimeout(400)
check((await title()) === 'Orologi', 'Orologi')
await keys(['Escape', 'ArrowDown', 'ArrowDown', 'Enter', 'Enter'])
await page.waitForTimeout(1200)
await keys(['ArrowDown', 'Enter'])
check((await page.evaluate(() => document.querySelectorAll('.sw-row').length)) === 1, 'cronometro con un giro')
await keys(['Escape', 'Escape', 'Escape'])

// Hold
await page.keyboard.press('h')
await keys(['Enter'])
check((await title()) === 'iPod' && (await page.evaluate(() => !!document.querySelector('.sb-left svg'))), 'Hold blocca i tasti e mostra il lucchetto')
await page.keyboard.press('h')
// torna in cima al menu principale (la selezione resta dove l'abbiamo lasciata, come sull'iPod)
await keys(['ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp'])

// Importazione di file veri dal selettore, poi doppioni
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Aggiungi musica' }).click()])
await chooser.setFiles([join(dir, '01 citta.wav'), join(dir, '02 uomo.wav'), join(dir, 'note.txt')])
await waitSyncDone()
check((await page.evaluate(() => document.querySelector('.sync-body')?.textContent)) === '2 brani aggiunti', 'due file WAV importati (il .txt ignorato)')
await keys(['Enter'])
const [chooser2] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Aggiungi musica' }).click()])
await chooser2.setFiles([join(dir, '01 citta.wav')])
await waitSyncDone()
check((await page.evaluate(() => document.querySelector('.sync-sub')?.textContent)) === '1 già presenti', 'reimportare lo stesso file non crea doppioni')
await keys(['Enter'])

// Artisti → Mina ha un solo album: si va dritti ai brani
await keys(['Enter', 'ArrowDown', 'ArrowDown', 'Enter'])
const artists = await rows()
check(artists.includes('Mina'), 'artista letto dai tag')
for (let i = 0; i < artists.length && (await selected()) !== 'Mina'; i++) await keys(['ArrowDown'])
await keys(['Enter'])
const minaRows = await rows()
check(JSON.stringify(minaRows) === JSON.stringify(['Città vuota', "È l'uomo per me"]), 'album con brani in ordine di traccia e titoli con accenti', [await title(), minaRows])

// Persistenza dopo ricarica
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(2800)
await keys(['Enter', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'Enter'])
// la lista mostra al massimo 9 righe: con 12 brani compare la barra di scorrimento
const songRows = await rows()
const hasScrollbar = await page.evaluate(() => !!document.querySelector('.scrollbar'))
check((await title()) === 'Brani' && songRows.length === 9 && hasScrollbar, 'dodici brani dopo la ricarica (9 righe visibili e barra di scorrimento)', [await title(), songRows.length, hasScrollbar])

await ctx.close()
await browser.close()
if (errors.length) failures.push('errori JS: ' + errors.join(' | '))
if (failures.length) {
  console.log('\nPROBLEMI:\n' + failures.join('\n'))
  process.exitCode = 1
} else console.log('\nOK: tutte le prove superate')
