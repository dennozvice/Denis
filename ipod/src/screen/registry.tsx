/**
 * Registro delle schermate: per ogni tipo, il componente, il gestore di input e il titolo
 * della barra di stato. Le liste usano tutte lo stesso componente e lo stesso gestore.
 */
import type { ComponentType } from 'react'
import { registerScreenInput, type ScreenInputHandler } from '../core/dispatcher'
import type { Screen, ScreenKind } from '../core/navigation'
import { t } from '../i18n/strings'
import { listDef } from './listModel'
import { listInput } from './listInput'
import { ListScreen } from './ListScreen'
import { nowPlayingInput, NowPlayingScreen } from './screens/NowPlaying'
import { AboutScreen, aboutInput, BrightnessScreen, brightnessInput, LegalScreen, SyncScreen, syncInput } from './screens/SimpleScreens'
import { coverFlowInput, CoverFlowScreen } from './screens/CoverFlow'
import { clockInput, ClockScreen } from './screens/Clock'
import { stopwatchInput, StopwatchScreen } from './screens/Stopwatch'
import './screens/menus'

export interface ScreenDef {
  Component: ComponentType<{ screen: Screen }>
  input?: ScreenInputHandler
  title: (screen: Screen) => string
  /** Transizione d'ingresso: scorrimento (default) o dissolvenza. */
  transition?: 'slide' | 'fade'
  /** Sfondo scuro (Cover Flow). */
  dark?: boolean
}

const custom: Partial<Record<ScreenKind, ScreenDef>> = {
  nowPlaying: { Component: NowPlayingScreen, input: nowPlayingInput, title: () => t('nowPlaying') },
  about: { Component: AboutScreen, input: aboutInput, title: () => t('about') },
  brightness: { Component: BrightnessScreen, input: brightnessInput, title: () => t('brightness') },
  legal: { Component: LegalScreen, title: () => t('legal') },
  sync: { Component: SyncScreen, input: syncInput, title: () => t('ipod') },
  coverflow: { Component: CoverFlowScreen, input: coverFlowInput, title: () => t('coverFlow'), transition: 'fade', dark: true },
  clock: { Component: ClockScreen, input: clockInput, title: () => t('clocks') },
  stopwatch: { Component: StopwatchScreen, input: stopwatchInput, title: () => t('stopwatch') },
}

const listScreen: ScreenDef = {
  Component: ListScreen,
  input: listInput,
  title: (s) => listDef(s.kind)?.title(s) ?? '',
}

export function screenDef(kind: ScreenKind): ScreenDef {
  return custom[kind] ?? listScreen
}

/** Registra un componente per un tipo di schermata (usato da Cover Flow, Orologio, Cronometro). */
export function registerScreen(kind: ScreenKind, def: ScreenDef): void {
  custom[kind] = def
  if (def.input) registerScreenInput(kind, def.input)
}

/** Collega i gestori di input al dispatcher (una volta all'avvio). */
export function registerAllInputs(): void {
  const kinds: ScreenKind[] = [
    'main', 'music', 'videos', 'photos', 'empty', 'podcasts', 'extras', 'settings', 'playlists', 'playlist', 'artists', 'artist', 'albums', 'album', 'songs', 'genres', 'genre',
    'composers', 'composer', 'audiobooks', 'coverflow', 'nowPlaying', 'about', 'option', 'brightness', 'clock', 'stopwatch', 'games', 'sync', 'legal',
    'confirm', 'message',
  ]
  for (const k of kinds) {
    const def = screenDef(k)
    if (def.input) registerScreenInput(k, def.input)
  }
}
