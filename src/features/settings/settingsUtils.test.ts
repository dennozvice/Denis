import { describe, expect, it } from 'vitest'
import { approxSize, backupFileName, parseIntInRange } from './settingsUtils'

describe('impostazioni', () => {
  it('nome del file di backup con la data', () => {
    expect(backupFileName('2026-10-02')).toBe('advisor-desk-backup-2026-10-02.json')
  })

  it('dimensione approssimativa', () => {
    expect(approxSize(300)).toBe('< 1 KB')
    expect(approxSize(42 * 1024 + 100)).toBe('≈ 42 KB')
    expect(approxSize(1000 * 1024)).toBe('≈ 1.000 KB')
    expect(approxSize(1300 * 1024)).toBe('≈ 1,3 MB')
  })

  it('numeri interi nell’intervallo', () => {
    expect(parseIntInRange('24', 1, 60)).toBe(24)
    expect(parseIntInRange(' 60 ', 1, 60)).toBe(60)
    expect(parseIntInRange('0', 1, 60)).toBeNull()
    expect(parseIntInRange('61', 1, 60)).toBeNull()
    expect(parseIntInRange('12.5', 1, 60)).toBeNull()
    expect(parseIntInRange('', 1, 60)).toBeNull()
    expect(parseIntInRange('-3', 1, 60)).toBeNull()
  })
})
