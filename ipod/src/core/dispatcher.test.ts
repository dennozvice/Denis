import { beforeEach, describe, expect, it } from 'vitest'
import { dispatch, registerScreenInput, seekStepFor } from './dispatcher'
import { nav } from './navigation'
import { system, systemStore } from './system'
import { settingsStore, DEFAULT_SETTINGS } from './settings'

describe('dispatcher', () => {
  beforeEach(() => {
    settingsStore.set({ ...DEFAULT_SETTINGS, clicker: false })
    system.reset()
    system.boot()
    nav.reset()
  })

  it('MENU torna indietro, tenere premuto MENU torna al menu principale', () => {
    nav.push('music')
    nav.push('artists')
    dispatch({ type: 'press', button: 'menu' })
    expect(nav.top().kind).toBe('music')
    nav.push('artists')
    dispatch({ type: 'hold', button: 'menu', elapsed: 700 })
    expect(nav.top().kind).toBe('main')
  })
  it('con Hold inserito ignora i comandi e fa lampeggiare il lucchetto', () => {
    nav.push('music')
    dispatch({ type: 'holdSwitch', locked: true })
    dispatch({ type: 'press', button: 'menu' })
    expect(nav.top().kind).toBe('music')
    expect(systemStore.get().holdFlashUntil).toBeGreaterThan(0)
    dispatch({ type: 'holdSwitch', locked: false })
    dispatch({ type: 'press', button: 'menu' })
    expect(nav.top().kind).toBe('main')
  })
  it('in sospensione un tasto sveglia soltanto; con schermo spento il primo input riaccende soltanto', () => {
    nav.push('music')
    system.sleep()
    dispatch({ type: 'press', button: 'menu' })
    expect(systemStore.get().asleep).toBe(false)
    expect(nav.top().kind).toBe('music')
    systemStore.patch({ backlight: false })
    dispatch({ type: 'press', button: 'menu' })
    expect(systemStore.get().backlight).toBe(true)
    expect(nav.top().kind).toBe('music')
    dispatch({ type: 'press', button: 'menu' })
    expect(nav.top().kind).toBe('main')
  })
  it('la schermata in cima può consumare l’evento', () => {
    let seen = 0
    registerScreenInput('music', (e) => {
      if (e.type === 'press' && e.button === 'menu') {
        seen++
        return true
      }
      return false
    })
    nav.push('music')
    dispatch({ type: 'press', button: 'menu' })
    expect(seen).toBe(1)
    expect(nav.top().kind).toBe('music')
    handlersCleanup()
  })
  it('tenere premuto Play sospende', () => {
    dispatch({ type: 'hold', button: 'play', elapsed: 2000 })
    expect(systemStore.get().asleep).toBe(true)
  })
  it('l’avanzamento veloce accelera', () => {
    expect(seekStepFor(0)).toBeLessThan(seekStepFor(2000))
    expect(seekStepFor(2000)).toBeLessThan(seekStepFor(9000))
  })
})

function handlersCleanup() {
  registerScreenInput('music', () => false)
}
