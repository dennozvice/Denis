/**
 * Modello di input della ghiera (click wheel). Tutti i modi di comandare l'iPod
 * (dito/mouse sulla ghiera, rotella del mouse, tastiera) producono questi eventi;
 * le schermate reagiscono solo a questi, senza sapere da dove vengono.
 */
export type WheelButton = 'menu' | 'prev' | 'next' | 'play' | 'center'

export type InputEvent =
  /** Rotazione: `steps` scatti (positivo = orario = giù/avanti), `velocity` in scatti al secondo. */
  | { type: 'rotate'; steps: number; velocity: number }
  /** Pressione breve, emessa al rilascio se non è scattata la pressione prolungata. */
  | { type: 'press'; button: WheelButton }
  /** Pressione prolungata: scatta una sola volta superata la soglia (MENU/centro/play) o a ripetizione (prev/next per avanzare). */
  | { type: 'hold'; button: WheelButton; elapsed: number }
  /** Rilascio fisico (serve ad es. per fermare l'avanzamento veloce). */
  | { type: 'release'; button: WheelButton; held: boolean }
  /** Interruttore Hold in cima al dispositivo. */
  | { type: 'holdSwitch'; locked: boolean }

export type InputHandler = (event: InputEvent) => void
