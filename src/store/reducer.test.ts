import { describe, expect, it } from 'vitest'
import { createDemoData } from '../data/demoSeed'
import { appReducer } from './reducer'

const base = () => createDemoData('2026-10-02')

describe('reducer', () => {
  it('completa e riapre un\'attività', () => {
    const s1 = appReducer(base(), { type: 'task/toggle', id: 't01', at: '2026-10-02T08:00:00.000Z' })
    const t1 = s1.tasks.find((t) => t.id === 't01')!
    expect(t1.status).toBe('completata')
    expect(t1.completedAt).toBe('2026-10-02T08:00:00.000Z')
    const s2 = appReducer(s1, { type: 'task/toggle', id: 't01', at: 'x' })
    const t2 = s2.tasks.find((t) => t.id === 't01')!
    expect(t2.status).toBe('da_fare')
    expect(t2.completedAt).toBeUndefined()
  })

  it('eliminando un cliente scollega i record collegati', () => {
    const s = appReducer(base(), { type: 'client/delete', id: 'c01' })
    expect(s.clients.some((c) => c.id === 'c01')).toBe(false)
    expect(s.tasks.some((t) => t.clientId === 'c01')).toBe(false)
    expect(s.appointments.some((a) => a.clientId === 'c01')).toBe(false)
    expect(s.cases.some((k) => k.clientId === 'c01')).toBe(false)
    expect(s.tasks.find((t) => t.id === 't01')).toBeDefined()
  })

  it("dopo una modifica dell'utente la demo non viene più spostata in avanti", () => {
    const s = appReducer(base(), { type: 'client/update', id: 'c01', patch: { docExpiry: '2027-01-01' } })
    expect(s.demoGeneratedOn).toBeUndefined()
    expect(s.isDemo).toBe(true)
    const t = appReducer(base(), { type: 'settings/update', patch: { theme: 'scuro' } })
    expect(t.demoGeneratedOn).toBe('2026-10-02')
  })

  it('import calendario: aggiorna per UID e aggiunge i nuovi', () => {
    const ev = {
      id: 'i1',
      title: 'Evento',
      type: 'call' as const,
      date: '2026-10-05',
      start: '10:00',
      end: '10:30',
      location: 'telefono' as const,
      status: 'confermato' as const,
      source: 'ics' as const,
      externalId: 'uid-1',
    }
    const s1 = appReducer(base(), { type: 'appointment/import', appointments: [ev] })
    const s2 = appReducer(s1, { type: 'appointment/import', appointments: [{ ...ev, id: 'i2', start: '11:00' }] })
    const imported = s2.appointments.filter((a) => a.externalId === 'uid-1')
    expect(imported).toHaveLength(1)
    expect(imported[0].start).toBe('11:00')
    expect(imported[0].id).toBe('i1')
    // stato e note decisi nell'app sopravvivono al re-import
    const s3 = appReducer(s2, { type: 'appointment/update', id: 'i1', patch: { status: 'svolto', notes: 'ok', type: 'firma_contratto' } })
    const s4 = appReducer(s3, { type: 'appointment/import', appointments: [{ ...ev, id: 'i3', start: '12:00' }] })
    expect(s4.appointments.find((a) => a.id === 'i1')).toMatchObject({ status: 'svolto', notes: 'ok', type: 'firma_contratto', start: '12:00' })
  })
})
