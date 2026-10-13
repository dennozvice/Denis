import { describe, expect, it } from 'vitest'
import {
  DetentAccumulator,
  VelocityMeter,
  angleOf,
  deltaAngle,
  moveSelection,
  rowsPerDetent,
  scrollWindow,
  wheelDeltaToDegrees,
} from './wheelMath'

describe('angleOf', () => {
  it('misura 0° alle ore 12 e cresce in senso orario', () => {
    expect(angleOf(0, 0, 0, -1)).toBeCloseTo(0)
    expect(angleOf(0, 0, 1, 0)).toBeCloseTo(90)
    expect(angleOf(0, 0, 0, 1)).toBeCloseTo(180)
    expect(angleOf(0, 0, -1, 0)).toBeCloseTo(270)
  })
})

describe('deltaAngle', () => {
  it('sceglie sempre il verso più breve, anche attraverso lo zero', () => {
    expect(deltaAngle(10, 20)).toBe(10)
    expect(deltaAngle(350, 10)).toBe(20)
    expect(deltaAngle(10, 350)).toBe(-20)
    expect(deltaAngle(0, 180)).toBe(180)
  })
})

describe('DetentAccumulator', () => {
  it('conserva il resto tra una chiamata e l’altra', () => {
    const acc = new DetentAccumulator(15)
    expect(acc.add(10)).toBe(0)
    expect(acc.add(10)).toBe(1)
    expect(acc.add(-5)).toBe(0)
    expect(acc.add(-15)).toBe(-1)
    expect(acc.add(46)).toBe(3)
  })
})

describe('rowsPerDetent', () => {
  it('non accelera mai nelle liste corte', () => {
    expect(rowsPerDetent(50, 12)).toBe(1)
  })
  it('accelera in modo monotono con la velocità', () => {
    const rows = [0, 5, 10, 18, 30, 60].map((v) => rowsPerDetent(v, 500))
    for (let i = 1; i < rows.length; i++) expect(rows[i]).toBeGreaterThanOrEqual(rows[i - 1]!)
    expect(rows[0]).toBe(1)
    expect(rows[rows.length - 1]).toBeGreaterThanOrEqual(3)
    expect(rows[rows.length - 1]).toBeLessThanOrEqual(10)
  })
})

describe('VelocityMeter', () => {
  it('stima gli scatti al secondo da campioni ravvicinati', () => {
    const m = new VelocityMeter(250)
    for (let i = 0; i < 5; i++) m.push(i * 50, 1)
    expect(m.value(200)).toBeGreaterThan(15)
    expect(m.value(2000)).toBe(0)
  })
})

describe('moveSelection e scrollWindow', () => {
  it('non esce dai limiti della lista', () => {
    expect(moveSelection(0, -3, 10)).toBe(0)
    expect(moveSelection(9, 3, 10)).toBe(9)
    expect(moveSelection(4, 2, 10)).toBe(6)
    expect(moveSelection(0, 1, 0)).toBe(0)
  })
  it('scorre solo quando la selezione tocca il bordo della finestra', () => {
    expect(scrollWindow(0, 3, 9, 50)).toBe(0)
    expect(scrollWindow(0, 9, 9, 50)).toBe(1)
    expect(scrollWindow(10, 9, 9, 50)).toBe(9)
    expect(scrollWindow(45, 49, 9, 50)).toBe(41)
    expect(scrollWindow(0, 2, 9, 5)).toBe(0)
  })
})

describe('wheelDeltaToDegrees', () => {
  it('converte pixel, righe e pagine', () => {
    expect(wheelDeltaToDegrees(40, 0)).toBeCloseTo(15)
    expect(wheelDeltaToDegrees(1, 1)).toBeCloseTo(6)
    expect(wheelDeltaToDegrees(-30, 0)).toBeCloseTo(-11.25)
    // rotella a scatti: un evento = uno scatto, qualunque sia l'ampiezza
    expect(wheelDeltaToDegrees(120, 0)).toBeCloseTo(15)
    expect(wheelDeltaToDegrees(-100, 0)).toBeCloseTo(-15)
  })
})
