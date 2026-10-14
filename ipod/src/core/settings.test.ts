import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, sanitizeSettings } from './settings'

describe('sanitizeSettings', () => {
  it('accetta valori validi', () => {
    const s = sanitizeSettings({ language: 'en', color: 'black', brightness: 40, backlightSeconds: 0, shuffle: 'songs', repeat: 'all', eq: 'rock', volume: 10, clicker: false })
    expect(s).toMatchObject({ language: 'en', color: 'black', brightness: 40, backlightSeconds: 0, shuffle: 'songs', repeat: 'all', eq: 'rock', volume: 10, clicker: false })
  })
  it('riporta ai predefiniti valori assenti, sconosciuti o fuori scala', () => {
    const s = sanitizeSettings({ language: 'fr', color: 7, brightness: 500, backlightSeconds: 7, shuffle: 'yes', volume: -3, eq: 'nope' })
    expect(s.language).toBe('it')
    expect(s.color).toBe('silver')
    expect(s.brightness).toBe(100)
    expect(s.backlightSeconds).toBe(DEFAULT_SETTINGS.backlightSeconds)
    expect(s.shuffle).toBe('off')
    expect(s.volume).toBe(0)
    expect(s.eq).toBe('off')
  })
  it('sopravvive a input non oggetto', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings('x')).toEqual(DEFAULT_SETTINGS)
  })
})
