/**
 * Orologi (Extra): lista di orologi (quadrante analogico + ora digitale) per vari fusi,
 * con sotto-menu per orologio (Cambia città / Elimina) e lista delle città del mondo.
 * Gli orologi restano in localStorage (`ipod:clocks`), validati alla lettura.
 *
 * Modi della schermata: '' = lista orologi, 'menu' = sotto-menu, 'cities' = scelta città.
 * Nei sotto-modi `params` ricorda la riga da cui si è partiti (back/backFirst) e l'orologio
 * interessato (clock = indice, oppure 'new' per "Aggiungi orologio").
 */
import type { InputEvent } from '../../core/input'
import { nav, type Screen } from '../../core/navigation'
import { useSettings } from '../../core/settings'
import { createStore, useStore } from '../../core/store'
import { moveSelection, rowsPerDetent, scrollWindow } from '../../device/wheelMath'
import { t } from '../../i18n/strings'
import { MenuList } from '../MenuList'
import { ROW_HEIGHT, VISIBLE_ROWS, type ListItem } from '../listModel'
import { useNow } from './useNow'
import './extras.css'

export interface ClockEntry {
  city: string
  zone: string
}

export const CLOCKS_KEY = 'ipod:clocks'
const VIEW_H = 219
const CLOCK_ROW = 56

/* ---------- Fusi orari ---------- */
const formatters = new Map<string, Intl.DateTimeFormat>()

/** Vero se il browser conosce il fuso; nel caso prepara il formatter (mai durante il render). */
function knownZone(zone: string): boolean {
  if (formatters.has(zone)) return true
  try {
    formatters.set(
      zone,
      new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        hourCycle: 'h23',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }),
    )
    return true
  } catch {
    return false
  }
}

/** Città del mondo selezionabili (zone IANA), in ordine alfabetico. */
export const WORLD_CITIES: readonly ClockEntry[] = (
  [
    ['Amsterdam', 'Europe/Amsterdam'],
    ['Anchorage', 'America/Anchorage'],
    ['Athens', 'Europe/Athens'],
    ['Auckland', 'Pacific/Auckland'],
    ['Bangkok', 'Asia/Bangkok'],
    ['Beijing', 'Asia/Shanghai'],
    ['Berlin', 'Europe/Berlin'],
    ['Bogotá', 'America/Bogota'],
    ['Buenos Aires', 'America/Argentina/Buenos_Aires'],
    ['Cairo', 'Africa/Cairo'],
    ['Cape Town', 'Africa/Johannesburg'],
    ['Chicago', 'America/Chicago'],
    ['Delhi', 'Asia/Kolkata'],
    ['Denver', 'America/Denver'],
    ['Dubai', 'Asia/Dubai'],
    ['Dublin', 'Europe/Dublin'],
    ['Helsinki', 'Europe/Helsinki'],
    ['Hong Kong', 'Asia/Hong_Kong'],
    ['Honolulu', 'Pacific/Honolulu'],
    ['Istanbul', 'Europe/Istanbul'],
    ['Jakarta', 'Asia/Jakarta'],
    ['Kathmandu', 'Asia/Kathmandu'],
    ['Lagos', 'Africa/Lagos'],
    ['Lima', 'America/Lima'],
    ['Lisbon', 'Europe/Lisbon'],
    ['London', 'Europe/London'],
    ['Los Angeles', 'America/Los_Angeles'],
    ['Madrid', 'Europe/Madrid'],
    ['Mexico City', 'America/Mexico_City'],
    ['Moscow', 'Europe/Moscow'],
    ['Nairobi', 'Africa/Nairobi'],
    ['New York', 'America/New_York'],
    ['Paris', 'Europe/Paris'],
    ['Reykjavík', 'Atlantic/Reykjavik'],
    ['Rio de Janeiro', 'America/Sao_Paulo'],
    ['Rome', 'Europe/Rome'],
    ['San Francisco', 'America/Los_Angeles'],
    ['Santiago', 'America/Santiago'],
    ['Seoul', 'Asia/Seoul'],
    ['Singapore', 'Asia/Singapore'],
    ['Stockholm', 'Europe/Stockholm'],
    ['Sydney', 'Australia/Sydney'],
    ['Tehran', 'Asia/Tehran'],
    ['Tokyo', 'Asia/Tokyo'],
    ['Toronto', 'America/Toronto'],
    ['Vancouver', 'America/Vancouver'],
    ['Vienna', 'Europe/Vienna'],
    ['Zurich', 'Europe/Zurich'],
  ] as const
)
  .map(([city, zone]) => ({ city, zone }))
  .sort((a, b) => a.city.localeCompare(b.city, 'en'))

/** Nome città da un fuso IANA: ultimo segmento, trattini bassi → spazi. */
function cityName(zone: string): string {
  return (zone.split('/').pop() ?? zone).replace(/_/g, ' ')
}

/** Riga della lista città che corrisponde a un orologio (stesso nome, altrimenti stesso fuso). */
function cityIndex(clock: ClockEntry | undefined): number {
  if (!clock) return 0
  const exact = WORLD_CITIES.findIndex((c) => c.city === clock.city && c.zone === clock.zone)
  if (exact >= 0) return exact
  return WORLD_CITIES.findIndex((c) => c.zone === clock.zone)
}

/* ---------- Orologi salvati ---------- */
function defaultClocks(): ClockEntry[] {
  let local = 'UTC'
  try {
    local = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    /* browser senza fusi orari: resta UTC */
  }
  if (!knownZone(local)) local = 'UTC'
  const list: ClockEntry[] = [{ city: cityName(local), zone: local }]
  for (const zone of ['America/New_York', 'Asia/Tokyo', 'Europe/London']) {
    if (list.length >= 3) break
    if (zone !== local && knownZone(zone)) list.push({ city: cityName(zone), zone })
  }
  return list
}

/** Riporta il contenuto di localStorage a una lista valida; null se non c'è nulla di buono. */
export function sanitizeClocks(raw: unknown): ClockEntry[] | null {
  if (!Array.isArray(raw)) return null
  const out: ClockEntry[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const { city, zone } = item as Record<string, unknown>
    if (typeof city !== 'string' || typeof zone !== 'string' || !city.trim() || !knownZone(zone)) continue
    out.push({ city: city.trim().slice(0, 40), zone })
  }
  return out.length ? out : null
}

function loadClocks(): ClockEntry[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CLOCKS_KEY) : null
    return (raw ? sanitizeClocks(JSON.parse(raw)) : null) ?? defaultClocks()
  } catch {
    return defaultClocks()
  }
}

export const clocksStore = createStore<ClockEntry[]>(loadClocks())

clocksStore.subscribe((clocks) => {
  try {
    localStorage.setItem(CLOCKS_KEY, JSON.stringify(clocks))
  } catch {
    /* storage pieno o disabilitato: gli orologi valgono per la sessione */
  }
})

/* ---------- Ora nel fuso ---------- */
interface ZoneTime {
  h: number
  m: number
  s: number
  /** Giorno del fuso rispetto a quello locale: −1 ieri, 0 oggi, +1 domani. */
  dayOffset: number
}

function zoneTime(zone: string, now: number): ZoneTime {
  const d = new Date(now)
  const f = formatters.get(zone)
  if (!f) return { h: d.getHours(), m: d.getMinutes(), s: d.getSeconds(), dayOffset: 0 }
  const v: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {}
  for (const p of f.formatToParts(d)) if (p.type !== 'literal') v[p.type] = Number(p.value)
  const zoneDay = Date.UTC(v.year ?? 1970, (v.month ?? 1) - 1, v.day ?? 1)
  const localDay = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  return { h: (v.hour ?? 0) % 24, m: v.minute ?? 0, s: v.second ?? 0, dayOffset: Math.round((zoneDay - localDay) / 864e5) }
}

function digital(h: number, m: number, h24: boolean): string {
  const mm = String(m).padStart(2, '0')
  if (h24) return `${String(h).padStart(2, '0')}:${mm}`
  return `${h % 12 || 12}:${mm} ${h < 12 ? 'AM' : 'PM'}`
}

/* ---------- Finestra di scorrimento (righe di altezza diversa) ---------- */
function rowHeights(count: number): number[] {
  const heights = Array.from({ length: count }, () => CLOCK_ROW)
  heights.push(ROW_HEIGHT)
  return heights
}

function topOf(heights: readonly number[], index: number): number {
  let y = 0
  for (let i = 0; i < index; i++) y += heights[i]!
  return y
}

/** Prima riga visibile: la selezione deve entrare tutta; si scorre per righe intere, come sull'iPod. */
function firstVisible(first: number, sel: number, heights: readonly number[]): number {
  let f = Math.max(0, Math.min(first, sel))
  while (f < sel && topOf(heights, sel + 1) - topOf(heights, f) > VIEW_H) f++
  while (f > 0 && topOf(heights, heights.length) - topOf(heights, f - 1) <= VIEW_H) f--
  return f
}

/* ---------- Input ---------- */
function backToList(screen: Screen, sel: number, count: number): void {
  const backFirst = Number(screen.params.backFirst) || 0
  nav.update({ mode: '', sel, first: firstVisible(backFirst, sel, rowHeights(count)), params: {} })
}

function enterCities(screen: Screen, clock: string, current: ClockEntry | undefined): void {
  const sel = Math.max(0, cityIndex(current))
  nav.update({ mode: 'cities', sel, first: scrollWindow(0, sel, VISIBLE_ROWS, WORLD_CITIES.length), params: { ...screen.params, clock } })
}

function clockListInput(e: InputEvent, screen: Screen, clocks: ClockEntry[]): boolean {
  const length = clocks.length + 1
  if (e.type === 'rotate') {
    const sel = moveSelection(screen.sel, e.steps, length)
    if (sel === screen.sel) return false
    nav.update({ sel, first: firstVisible(screen.first, sel, rowHeights(clocks.length)) })
    return true
  }
  if (e.type === 'press' && e.button === 'center') {
    const params = { back: String(screen.sel), backFirst: String(screen.first) }
    if (screen.sel < clocks.length) nav.update({ mode: 'menu', sel: 0, first: 0, params: { ...params, clock: String(screen.sel) } })
    else enterCities({ ...screen, params }, 'new', undefined)
    return true
  }
  return false
}

function clockMenuInput(e: InputEvent, screen: Screen, clocks: ClockEntry[]): boolean {
  const index = Number(screen.params.clock) || 0
  if (e.type === 'rotate') {
    const sel = moveSelection(screen.sel, e.steps, 2)
    if (sel === screen.sel) return false
    nav.update({ sel })
    return true
  }
  if (e.type !== 'press') return false
  if (e.button === 'menu') {
    backToList(screen, Number(screen.params.back) || 0, clocks.length)
    return true
  }
  if (e.button !== 'center') return false
  if (screen.sel === 0) {
    enterCities(screen, String(index), clocks[index])
  } else if (clocks.length > 1) {
    const next = clocks.filter((_, i) => i !== index)
    clocksStore.set(next)
    backToList(screen, Math.min(index, next.length - 1), next.length)
  }
  return true
}

function cityListInput(e: InputEvent, screen: Screen, clocks: ClockEntry[]): boolean {
  const length = WORLD_CITIES.length
  if (e.type === 'rotate') {
    const sel = moveSelection(screen.sel, e.steps * rowsPerDetent(e.velocity, length), length)
    if (sel === screen.sel) return false
    nav.update({ sel, first: scrollWindow(screen.first, sel, VISIBLE_ROWS, length) })
    return true
  }
  if (e.type !== 'press') return false
  if (e.button === 'menu') {
    backToList(screen, Number(screen.params.back) || 0, clocks.length)
    return true
  }
  if (e.button !== 'center') return false
  const city = WORLD_CITIES[screen.sel]
  if (!city) return true
  if (screen.params.clock === 'new') {
    const next = [...clocks, { ...city }]
    clocksStore.set(next)
    backToList(screen, next.length - 1, next.length)
  } else {
    const index = Number(screen.params.clock) || 0
    const next = clocks.map((c, i) => (i === index ? { ...city } : c))
    clocksStore.set(next)
    backToList(screen, index, next.length)
  }
  return true
}

export function clockInput(e: InputEvent, screen: Screen): boolean {
  const clocks = clocksStore.get()
  switch (screen.mode) {
    case 'menu':
      return clockMenuInput(e, screen, clocks)
    case 'cities':
      return cityListInput(e, screen, clocks)
    default:
      return clockListInput(e, screen, clocks)
  }
}

/* ---------- Rendering ---------- */
const TICKS = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]

function ClockFace({ time, night }: { time: ZoneTime; night: boolean }) {
  const hands = night ? '#ffffff' : '#1a1a1a'
  const hour = (time.h % 12) * 30 + time.m * 0.5 + time.s / 120
  const minute = time.m * 6 + time.s * 0.1
  const second = time.s * 6
  return (
    <svg className="ck-face" width="48" height="48" viewBox="0 0 48 48">
      <circle cx="24" cy="24" r="23.5" fill={night ? '#1a1a1a' : '#ffffff'} stroke="#7a7a7a" strokeWidth="1" />
      {TICKS.map((a) => (
        <rect key={a} x="23.5" y="2.5" width="1" height="3" fill={night ? '#bbbbbb' : '#7a7a7a'} transform={`rotate(${a} 24 24)`} />
      ))}
      <rect x="23" y="10" width="2" height="14" fill={hands} transform={`rotate(${hour} 24 24)`} />
      <rect x="23" y="4" width="2" height="20" fill={hands} transform={`rotate(${minute} 24 24)`} />
      <rect x="23.5" y="2" width="1" height="22" fill="#d0342c" transform={`rotate(${second} 24 24)`} />
      <circle cx="24" cy="24" r="1.5" fill={hands} />
    </svg>
  )
}

function dayLabel(offset: number): string {
  if (offset === 0) return t('today')
  if (offset > 0) return t('tomorrow')
  return t('yesterday')
}

function ClockList({ screen, clocks }: { screen: Screen; clocks: ClockEntry[] }) {
  const h24 = useSettings((s) => s.clock24h)
  const now = useNow(1000)
  const heights = rowHeights(clocks.length)
  const total = topOf(heights, heights.length)
  const hasScrollbar = total > VIEW_H
  const width = hasScrollbar ? 305 : 320
  const first = Math.min(screen.first, heights.length - 1)
  const offset = topOf(heights, first)
  const thumbH = Math.max(14, Math.round((213 * VIEW_H) / total))
  const thumbTop = hasScrollbar ? Math.round((213 - thumbH) * Math.min(1, offset / (total - VIEW_H))) : 0
  const rows: React.ReactNode[] = []
  for (let i = first; i < heights.length && topOf(heights, i) - offset < VIEW_H; i++) {
    const top = topOf(heights, i) - offset
    const selected = i === screen.sel
    const clock = clocks[i]
    if (!clock) {
      rows.push(
        <div key="add" className="row" data-sel={selected ? 'true' : 'false'} style={{ top, width }}>
          <div className="row-label">{t('addClock')}</div>
        </div>,
      )
      continue
    }
    const time = zoneTime(clock.zone, now)
    const night = time.h < 6 || time.h >= 18
    rows.push(
      <div key={`${clock.zone}|${clock.city}|${i}`} className="ck-row" data-sel={selected ? 'true' : 'false'} style={{ top, width }}>
        <ClockFace time={time} night={night} />
        <div className="ck-city">{clock.city}</div>
        <div className="ck-time">{digital(time.h, time.m, h24)}</div>
        <div className="ck-date">{dayLabel(time.dayOffset)}</div>
      </div>,
    )
  }
  return (
    <div className="ck">
      {rows}
      {hasScrollbar && (
        <div className="scrollbar" style={{ left: 308 }}>
          <div className="scrollbar-thumb" style={{ top: thumbTop, height: thumbH }} />
        </div>
      )}
    </div>
  )
}

function ClockMenu({ screen, clocks }: { screen: Screen; clocks: ClockEntry[] }) {
  const canDelete = clocks.length > 1
  const rows = [t('changeCity'), t('deleteClock')]
  return (
    <div className="ck ck-menu">
      {rows.map((label, i) => (
        <div key={label} className="row" data-sel={screen.sel === i ? 'true' : 'false'} data-disabled={i === 1 && !canDelete ? 'true' : 'false'} style={{ top: i * ROW_HEIGHT }}>
          <div className="row-label">{label}</div>
        </div>
      ))}
    </div>
  )
}

function CityList({ screen, clocks }: { screen: Screen; clocks: ClockEntry[] }) {
  const current = screen.params.clock === 'new' ? undefined : clocks[Number(screen.params.clock) || 0]
  const checked = cityIndex(current)
  const items: ListItem[] = WORLD_CITIES.map((c, i) => ({
    id: `${c.zone}|${c.city}`,
    label: c.city,
    checked: current !== undefined && i === checked,
    action: { kind: 'none' },
  }))
  return (
    <div className="ck">
      <MenuList items={items} sel={screen.sel} first={screen.first} />
    </div>
  )
}

export function ClockScreen({ screen }: { screen: Screen }) {
  const clocks = useStore(clocksStore)
  if (screen.mode === 'menu') return <ClockMenu screen={screen} clocks={clocks} />
  if (screen.mode === 'cities') return <CityList screen={screen} clocks={clocks} />
  return <ClockList screen={screen} clocks={clocks} />
}
