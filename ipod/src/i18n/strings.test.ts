import { describe, expect, it } from 'vitest'
import { dictionaries } from './strings'

describe('dizionari', () => {
  it('inglese e italiano hanno le stesse chiavi, nessuna vuota', () => {
    const itKeys = Object.keys(dictionaries.it).sort()
    const enKeys = Object.keys(dictionaries.en).sort()
    expect(enKeys).toEqual(itKeys)
    for (const lang of ['it', 'en'] as const) {
      for (const [k, v] of Object.entries(dictionaries[lang])) {
        expect(String(v).trim().length, `${lang}.${k}`).toBeGreaterThan(0)
      }
    }
  })
})
