import { describe, expect, it } from 'vitest'
import { createDemoData } from '../data/demoSeed'
import { appReducer } from './reducer'
import { resolveInitialData } from './StoreContext'

const TODAY = '2026-10-03'

describe('dati iniziali', () => {
  it('primo avvio: nessun cliente, attività o appuntamento', () => {
    const { data } = resolveInitialData({ status: 'missing' }, TODAY, false)
    expect(data.clients).toHaveLength(0)
    expect(data.tasks).toHaveLength(0)
    expect(data.appointments).toHaveLength(0)
    expect(data.cases).toHaveLength(0)
    expect(data.isDemo).toBe(false)
  })

  it('la vecchia demo automatica, mai modificata, diventa vuota mantenendo le impostazioni', () => {
    const demo = createDemoData('2026-10-02', { ...createDemoData('2026-10-02').settings, advisorName: 'Dennis', theme: 'scuro' })
    const { data } = resolveInitialData({ status: 'ok', data: demo }, TODAY, false)
    expect(data.clients).toHaveLength(0)
    expect(data.settings).toMatchObject({ advisorName: 'Dennis', theme: 'scuro' })
  })

  it('una demo già modificata dall\'utente non viene toccata', () => {
    const edited = appReducer(createDemoData('2026-10-02'), { type: 'task/toggle', id: 't01', at: '2026-10-02T09:00:00.000Z' })
    const { data } = resolveInitialData({ status: 'ok', data: edited }, TODAY, false)
    expect(data.clients.length).toBeGreaterThan(0)
  })

  it('una demo caricata a richiesta (dopo la prima partenza vuota) resta', () => {
    const demo = createDemoData('2026-10-02')
    const { data } = resolveInitialData({ status: 'ok', data: demo }, TODAY, true)
    expect(data.clients.length).toBeGreaterThan(0)
    expect(data.demoGeneratedOn).toBe(TODAY)
  })

  it('dati illeggibili: partenza vuota con la copia da recuperare', () => {
    const r = resolveInitialData({ status: 'corrupt', backupKey: 'advisor-desk:data.bak' }, TODAY, true)
    expect(r.data.clients).toHaveLength(0)
    expect(r.corruptBackupKey).toBe('advisor-desk:data.bak')
  })
})
