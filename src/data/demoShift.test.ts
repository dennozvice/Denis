import { describe, expect, it } from 'vitest'
import { createDemoData } from './demoSeed'
import { shiftDemoData } from './demoShift'

describe('demo sempre aggiornata', () => {
  it('sposta tutte le date in avanti mantenendo le distanze da oggi', () => {
    const old = createDemoData('2026-10-02')
    const shifted = shiftDemoData(old, '2026-10-09')
    expect(shifted.demoGeneratedOn).toBe('2026-10-09')
    expect(shifted.tasks.find((t) => t.id === 't01')?.dueDate).toBe('2026-10-09')
    expect(shifted.appointments.find((a) => a.id === 'a01')?.date).toBe('2026-10-09')
    expect(shifted.clients.find((c) => c.id === 'c02')?.docExpiry).toBe('2026-10-05')
    expect(shifted.cases.find((k) => k.id === 'k02')?.dueDate).toBe('2026-10-19')
  })

  it('non tocca i dati reali o già aggiornati', () => {
    const demo = createDemoData('2026-10-02')
    expect(shiftDemoData(demo, '2026-10-02')).toBe(demo)
    const real = { ...demo, isDemo: false }
    expect(shiftDemoData(real, '2026-10-20')).toBe(real)
  })
})
