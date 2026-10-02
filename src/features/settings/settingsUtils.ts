/** Funzioni pure per la pagina Impostazioni (testate in settingsUtils.test.ts). */
import type { DateKey } from '../../domain/types'
import { formatNumber } from '../../lib/format'

export const APP_VERSION = '1.0.0'

export const IDD_MONTHS = { min: 1, max: 60, fallback: 24 } as const
export const RECONTACT_DAYS = { min: 30, max: 730, fallback: 180 } as const

/** Nome del file di backup: "advisor-desk-backup-2026-10-02.json". */
export function backupFileName(today: DateKey): string {
  return `advisor-desk-backup-${today}.json`
}

/** Dimensione approssimativa leggibile: "< 1 KB", "≈ 42 KB", "≈ 1,2 MB". */
export function approxSize(chars: number): string {
  if (chars < 1024) return '< 1 KB'
  const kb = chars / 1024
  if (kb < 1024) return `≈ ${formatNumber(Math.round(kb))} KB`
  return `≈ ${formatNumber(kb / 1024, 1)} MB`
}

/** Intero compreso tra min e max, oppure null se il testo non è valido. */
export function parseIntInRange(text: string, min: number, max: number): number | null {
  const t = text.trim()
  if (!/^\d+$/.test(t)) return null
  const n = Number(t)
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null
}
