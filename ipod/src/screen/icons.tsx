/** Glifi dello schermo (320×240): piccoli SVG a pixel interi, senza sfumature, come il firmware. */
import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>

export const PlayIcon = (p: P) => (
  <svg width="8" height="9" viewBox="0 0 8 9" {...p}>
    <polygon points="0,0 8,4.5 0,9" fill="currentColor" />
  </svg>
)
export const PauseIcon = (p: P) => (
  <svg width="8" height="9" viewBox="0 0 8 9" {...p}>
    <rect x="0" y="0" width="3" height="9" fill="currentColor" />
    <rect x="5" y="0" width="3" height="9" fill="currentColor" />
  </svg>
)
export const LockIcon = (p: P) => (
  <svg width="9" height="11" viewBox="0 0 9 11" {...p}>
    <path d="M2.25 5V3.25a2.25 2.25 0 0 1 4.5 0V5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <rect x="0" y="5" width="9" height="6" rx="1" fill="currentColor" />
  </svg>
)
export function BatteryIcon({ level, charging }: { level: number; charging: boolean }) {
  const fill = Math.round(18 * Math.max(0, Math.min(1, level)))
  const low = level <= 0.2
  return (
    <svg width="22" height="10" viewBox="0 0 22 10" aria-hidden="true">
      <defs>
        <linearGradient id="bat-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={low ? '#f05a4a' : '#9ee88a'} />
          <stop offset="1" stopColor={low ? '#d9261a' : '#3fb63c'} />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="19" height="9" rx="2" fill="#ffffff" stroke="#4a4a4a" />
      <rect x="20" y="3" width="2" height="4" fill="#4a4a4a" />
      {fill > 0 && <rect x="1" y="1" width={fill} height="8" rx="1.5" fill="url(#bat-g)" />}
      {charging && (
        <polygon points="11,0.5 7.5,5.5 10,5.5 9,9.5 12.5,4.5 10,4.5" fill="#ffffff" stroke="#333333" strokeWidth="0.8" strokeLinejoin="round" />
      )}
    </svg>
  )
}
export const Chevron = (p: P) => (
  <svg width="6" height="10" viewBox="0 0 6 10" {...p}>
    <polyline points="0.75,0.75 5,5 0.75,9.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
  </svg>
)
export const CheckIcon = (p: P) => (
  <svg width="10" height="9" viewBox="0 0 10 9" {...p}>
    <polyline points="1,4.5 3.8,7.5 9,1.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
  </svg>
)
export const SpeakerIcon = (p: P) => (
  <svg width="10" height="8" viewBox="0 0 10 8" {...p}>
    <polygon points="0,2.5 2,2.5 4.5,0 4.5,8 2,5.5 0,5.5" fill="currentColor" />
    <path d="M6 2.2a2.3 2.3 0 0 1 0 3.6M7.6 0.8a4.3 4.3 0 0 1 0 6.4" fill="none" stroke="currentColor" strokeWidth="1" />
  </svg>
)
export const ShuffleIcon = (p: P) => (
  <svg width="14" height="10" viewBox="0 0 14 10" {...p}>
    <path d="M0 2h2.5c1.5 0 2.5 1 3.5 3s2 3 3.5 3H12M0 8h2.5c1.5 0 2.5-1 3.5-3s2-3 3.5-3H12" fill="none" stroke="currentColor" strokeWidth="1.3" />
    <polygon points="11,0 14,2 11,4" fill="currentColor" />
    <polygon points="11,6 14,8 11,10" fill="currentColor" />
  </svg>
)
export function RepeatIcon({ one, ...p }: P & { one?: boolean }) {
  return (
    <svg width="13" height="10" viewBox="0 0 13 10" {...p}>
      <path d="M2.5 6.5V4.5a2 2 0 0 1 2-2H10M10.5 3.5v2a2 2 0 0 1-2 2H3" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <polygon points="9,0 12.5,2.5 9,5" fill="currentColor" />
      <polygon points="4,5 0.5,7.5 4,10" fill="currentColor" />
      {one && <text x="6.5" y="7.2" fontSize="5" fontWeight="700" textAnchor="middle" fill="currentColor">1</text>}
    </svg>
  )
}
/** Due crome unite: copertina generica. */
export const NoteIcon = (p: P) => (
  <svg viewBox="0 0 48 48" {...p}>
    <path d="M17 6v27.5A6.5 6.5 0 1 1 13 27V12l24-5v22.5A6.5 6.5 0 1 1 33 23V13.6L17 17z" fill="currentColor" />
  </svg>
)
export const SunIcon = (p: P) => (
  <svg viewBox="0 0 18 18" {...p}>
    <circle cx="9" cy="9" r="4" fill="currentColor" />
    <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <line x1="9" y1="0.8" x2="9" y2="3" />
      <line x1="9" y1="15" x2="9" y2="17.2" />
      <line x1="0.8" y1="9" x2="3" y2="9" />
      <line x1="15" y1="9" x2="17.2" y2="9" />
      <line x1="3.2" y1="3.2" x2="4.8" y2="4.8" />
      <line x1="13.2" y1="13.2" x2="14.8" y2="14.8" />
      <line x1="3.2" y1="14.8" x2="4.8" y2="13.2" />
      <line x1="13.2" y1="4.8" x2="14.8" y2="3.2" />
    </g>
  </svg>
)
export const SyncArrowsIcon = (p: P) => (
  <svg viewBox="0 0 56 56" {...p}>
    <path d="M44 20a18 18 0 0 0-31-5" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
    <polygon points="8,8 18,18 6,20" fill="currentColor" />
    <path d="M12 36a18 18 0 0 0 31 5" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
    <polygon points="48,48 38,38 50,36" fill="currentColor" />
  </svg>
)
export const CheckCircleIcon = (p: P) => (
  <svg viewBox="0 0 56 56" {...p}>
    <circle cx="28" cy="28" r="25" fill="none" stroke="currentColor" strokeWidth="4" />
    <polyline points="16,29 25,38 41,19" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
export const PlugIcon = (p: P) => (
  <svg viewBox="0 0 48 72" {...p}>
    <rect x="14" y="0" width="20" height="26" rx="2" fill="currentColor" />
    <rect x="18" y="4" width="4" height="8" fill="#f3f6fb" />
    <rect x="26" y="4" width="4" height="8" fill="#f3f6fb" />
    <rect x="8" y="26" width="32" height="30" rx="4" fill="currentColor" />
    <rect x="21" y="56" width="6" height="16" fill="currentColor" />
  </svg>
)
export const GearIcon = (p: P) => (
  <svg viewBox="0 0 64 64" {...p}>
    <path
      d="M32 4l5 8 9-3 2 9 9 2-3 9 8 5-8 5 3 9-9 2-2 9-9-3-5 8-5-8-9 3-2-9-9-2 3-9-8-5 8-5-3-9 9-2 2-9 9 3z"
      fill="currentColor"
    />
    <circle cx="32" cy="32" r="11" fill="#f3f6fb" />
  </svg>
)
