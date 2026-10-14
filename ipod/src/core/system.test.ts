import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SLEEP_AFTER_MS, setPlayingProbe, system, systemStore } from './system'
import { settingsStore, DEFAULT_SETTINGS } from './settings'

describe('system: retroilluminazione e sospensione', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    settingsStore.set({ ...DEFAULT_SETTINGS, backlightSeconds: 10 })
    system.reset()
    setPlayingProbe(() => false)
    system.boot()
  })
  afterEach(() => vi.useRealTimers())

  it('spegne la retroilluminazione dopo il tempo impostato e la riaccende al tocco', () => {
    expect(systemStore.get().backlight).toBe(true)
    vi.advanceTimersByTime(10_000)
    expect(systemStore.get().backlight).toBe(false)
    system.touch()
    expect(systemStore.get().backlight).toBe(true)
  })
  it('con "sempre accesa" non si spegne', () => {
    settingsStore.patch({ backlightSeconds: 0 })
    system.touch()
    vi.advanceTimersByTime(60_000)
    expect(systemStore.get().backlight).toBe(true)
  })
  it('si addormenta da fermo, non mentre suona', () => {
    vi.advanceTimersByTime(SLEEP_AFTER_MS)
    expect(systemStore.get().asleep).toBe(true)
    system.wake()
    setPlayingProbe(() => true)
    system.touch()
    vi.advanceTimersByTime(SLEEP_AFTER_MS * 3)
    expect(systemStore.get().asleep).toBe(false)
  })
  it('Hold: blocca e lampeggia', () => {
    system.setHold(true)
    expect(systemStore.get().hold).toBe(true)
    system.flashHold()
    expect(systemStore.get().holdFlashUntil).toBeGreaterThan(0)
    system.setHold(false)
    expect(systemStore.get().hold).toBe(false)
  })
})
