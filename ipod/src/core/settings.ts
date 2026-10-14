/**
 * Impostazioni dell'iPod, salvate in localStorage. Ogni campo è validato alla lettura:
 * un valore corrotto o sconosciuto torna al predefinito senza bloccare l'app.
 */
import type { RepeatMode, ShuffleMode } from '../audio/queue'
import type { Language } from '../i18n/types'
import { createStore, useStore } from './store'

export type DeviceColor = 'silver' | 'black'
export type EqPreset = 'off' | 'acoustic' | 'bassBooster' | 'bassReducer' | 'classical' | 'dance' | 'deep' | 'electronic' | 'flat' | 'hipHop' | 'jazz' | 'latin' | 'loudness' | 'lounge' | 'piano' | 'pop' | 'rnb' | 'rock' | 'smallSpeakers' | 'spokenWord' | 'trebleBooster' | 'trebleReducer' | 'vocalBooster'

export const EQ_PRESETS: readonly EqPreset[] = [
  'off', 'acoustic', 'bassBooster', 'bassReducer', 'classical', 'dance', 'deep', 'electronic', 'flat', 'hipHop', 'jazz', 'latin',
  'loudness', 'lounge', 'piano', 'pop', 'rnb', 'rock', 'smallSpeakers', 'spokenWord', 'trebleBooster', 'trebleReducer', 'vocalBooster',
]

/** Secondi di retroilluminazione: 0 = sempre accesa. */
export const BACKLIGHT_OPTIONS = [2, 5, 10, 15, 20, 30, 0] as const

export interface Settings {
  language: Language
  color: DeviceColor
  clicker: boolean
  /** 0–100 */
  brightness: number
  backlightSeconds: number
  shuffle: ShuffleMode
  repeat: RepeatMode
  eq: EqPreset
  /** 0–100 */
  volume: number
  soundCheck: boolean
  /** Formato ora: true = 24 ore. */
  clock24h: boolean
  /** Prima apertura già mostrata (suggerimento su come aggiungere musica). */
  welcomed: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'it',
  color: 'silver',
  clicker: true,
  brightness: 100,
  backlightSeconds: 10,
  shuffle: 'off',
  repeat: 'off',
  eq: 'off',
  volume: 55,
  soundCheck: false,
  clock24h: true,
  welcomed: false,
}

export const SETTINGS_KEY = 'ipod:settings'

const isOneOf = <T extends string>(v: unknown, list: readonly T[]): v is T => typeof v === 'string' && (list as readonly string[]).includes(v)
const num = (v: unknown, min: number, max: number, def: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def)
const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def)

/** Riporta qualunque oggetto a impostazioni valide. */
export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = DEFAULT_SETTINGS
  return {
    language: isOneOf(r.language, ['it', 'en'] as const) ? r.language : d.language,
    color: isOneOf(r.color, ['silver', 'black'] as const) ? r.color : d.color,
    clicker: bool(r.clicker, d.clicker),
    brightness: num(r.brightness, 10, 100, d.brightness),
    backlightSeconds: isOneOf(String(r.backlightSeconds), BACKLIGHT_OPTIONS.map(String)) ? Number(r.backlightSeconds) : d.backlightSeconds,
    shuffle: isOneOf(r.shuffle, ['off', 'songs', 'albums'] as const) ? r.shuffle : d.shuffle,
    repeat: isOneOf(r.repeat, ['off', 'one', 'all'] as const) ? r.repeat : d.repeat,
    eq: isOneOf(r.eq, EQ_PRESETS) ? r.eq : d.eq,
    volume: num(r.volume, 0, 100, d.volume),
    soundCheck: bool(r.soundCheck, d.soundCheck),
    clock24h: bool(r.clock24h, d.clock24h),
    welcomed: bool(r.welcomed, d.welcomed),
  }
}

function load(): Settings {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SETTINGS_KEY) : null
    return sanitizeSettings(raw ? JSON.parse(raw) : null)
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export const settingsStore = createStore<Settings>(load())

settingsStore.subscribe((s) => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    /* quota piena o storage disabilitato: le impostazioni valgono per la sessione */
  }
})

export function updateSettings(partial: Partial<Settings>): void {
  settingsStore.patch(partial)
}

export function resetSettings(): void {
  settingsStore.set({ ...DEFAULT_SETTINGS, welcomed: true })
}

export function useSettings<S = Settings>(selector?: (s: Settings) => S): S {
  return useStore(settingsStore, selector)
}
