import { describe, expect, it } from 'vitest'
import { createDemoData } from './demoSeed'
import {
  DATA_KEY,
  loadAppData,
  loadAppDataResult,
  normalizeAppData,
  normalizeImports,
  parseBackup,
  saveAppData,
  serializeBackup,
  type KeyValueStorage,
} from './persistence'

function memoryStorage(): KeyValueStorage & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  }
}

describe('persistenza', () => {
  it('salva e rilegge i dati', () => {
    const s = memoryStorage()
    const data = createDemoData('2026-10-02')
    expect(saveAppData(data, s)).toEqual({ ok: true })
    expect(loadAppData(s)).toEqual(data)
  })

  it('con dati corrotti riparte da zero conservando una copia', () => {
    const s = memoryStorage()
    s.setItem(DATA_KEY, '{non json')
    expect(loadAppData(s)).toBeNull()
    expect(s.map.get('advisor-desk:data.bak')).toBe('{non json')
  })

  it('scarta i record malformati e completa le impostazioni', () => {
    const data = normalizeAppData({
      schemaVersion: 1,
      tasks: [{ id: 'x', title: 'ok', dueDate: '2026-10-02' }, { id: 'y' }, 'boh'],
      settings: { advisorName: 'Test', theme: 'viola' },
    })
    expect(data?.tasks).toHaveLength(1)
    expect(data?.settings.theme).toBe('sistema')
    expect(data?.settings.advisorName).toBe('Test')
    expect(normalizeAppData({ schemaVersion: 99 })).toBeNull()
  })

  it('valori non validi vengono corretti invece di rompere l\'app', () => {
    const data = normalizeAppData({
      schemaVersion: 1,
      tasks: [{ id: 't', title: 'x', dueDate: '2026-10-02', category: 'boh', priority: 'urgentissima', dueTime: '25:99' }],
      appointments: [{ id: 'a', title: 'y', date: '2026-10-02', start: '10:00', end: '09:00', type: 'party', location: 'luna' }],
      clients: [{ id: 'c', lastName: 'Z', policies: [{ id: 'p', kind: 'strana', startDate: '2020-01-01' }, { id: 'q' }] }],
      cases: [{ id: 'k', title: 'z', openedOn: '2026-10-01', type: 'boh', status: 'boh' }],
    })!
    expect(data.tasks[0]).toMatchObject({ category: 'altro', priority: 'media', status: 'da_fare' })
    expect(data.tasks[0].dueTime).toBeUndefined()
    expect(data.appointments[0]).toMatchObject({ type: 'altro', location: 'ufficio', end: '11:00' })
    expect(data.clients[0].policies).toHaveLength(1)
    expect(data.clients[0].policies[0].kind).toBe('altro')
    expect(data.cases[0]).toMatchObject({ type: 'riscatto', status: 'aperta' })
  })

  it('dati illeggibili: copia conservata senza sovrascrivere quella precedente', () => {
    const s = memoryStorage()
    s.setItem('advisor-desk:data.bak', 'vecchia copia')
    s.setItem(DATA_KEY, '{rotto')
    const r = loadAppDataResult(s)
    expect(r.status).toBe('corrupt')
    expect(s.map.get('advisor-desk:data.bak')).toBe('vecchia copia')
    if (r.status === 'corrupt') expect(s.map.get(r.backupKey)).toBe('{rotto')
  })

  it('serie importate: punti non validi scartati', () => {
    const list = normalizeImports([
      { id: 'x', name: 'X', series: [{ date: '30/09/2026', value: 1 }, null, { date: '2026-10-01', value: 'a' }, { date: '2026-10-02', value: 10 }, { date: '2026-09-30', value: 9 }] },
      { id: 'vuota', series: [{ date: 'boh', value: 1 }] },
    ])
    expect(list).toHaveLength(1)
    expect(list[0].series).toEqual([{ date: '2026-09-30', value: 9 }, { date: '2026-10-02', value: 10 }])
    expect(list[0]).toMatchObject({ unit: 'EUR', group: 'fondo', source: 'import' })
  })

  it('backup: andata e ritorno', () => {
    const data = createDemoData('2026-10-02')
    const parsed = parseBackup(serializeBackup(data, []))
    expect(parsed?.data).toEqual(data)
    expect(parseBackup('ciao')).toBeNull()
  })
})
