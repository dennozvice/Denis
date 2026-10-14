import { describe, expect, it } from 'vitest'
import { zoneForAngle } from './useClickWheel'

describe('zoneForAngle', () => {
  it('assegna i quadranti: MENU in alto, next a destra, play in basso, prev a sinistra', () => {
    expect(zoneForAngle(0)).toBe('menu')
    expect(zoneForAngle(44)).toBe('menu')
    expect(zoneForAngle(320)).toBe('menu')
    expect(zoneForAngle(90)).toBe('next')
    expect(zoneForAngle(180)).toBe('play')
    expect(zoneForAngle(270)).toBe('prev')
  })
})
