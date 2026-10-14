/** Etichette della ghiera: MENU e i tre glifi (prev, next, play/pausa), disegnati in mm come i veri serigrafati. */

/* viewBox in decimi di millimetro: altezza 17 = 1.7 mm */
export function PrevGlyph() {
  return (
    <svg viewBox="0 0 40 17" aria-hidden="true">
      <rect x="0" y="0" width="5" height="17" />
      <polygon points="8,8.5 23,0 23,17" />
      <polygon points="25,8.5 40,0 40,17" />
    </svg>
  )
}

export function NextGlyph() {
  return (
    <svg viewBox="0 0 40 17" aria-hidden="true">
      <polygon points="0,0 15,8.5 0,17" />
      <polygon points="17,0 32,8.5 17,17" />
      <rect x="35" y="0" width="5" height="17" />
    </svg>
  )
}

export function PlayPauseGlyph() {
  return (
    <svg viewBox="0 0 34 17" aria-hidden="true">
      <polygon points="0,0 16,8.5 0,17" />
      <rect x="20" y="0" width="5" height="17" />
      <rect x="28.5" y="0" width="5" height="17" />
    </svg>
  )
}
