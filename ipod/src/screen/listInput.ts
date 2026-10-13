/**
 * Gestore di input comune a tutte le liste: rotazione = selezione (con accelerazione
 * e lettera grande), centro = azione della riga, centro prolungato = On-The-Go.
 */
import { player } from '../audio/player'
import type { InputEvent } from '../core/input'
import { nav, type Screen } from '../core/navigation'
import { ui } from '../core/ui'
import { library } from '../library/index'
import { t } from '../i18n/strings'
import { moveSelection, rowsPerDetent, scrollWindow } from '../device/wheelMath'
import { listDef, listItems, VISIBLE_ROWS, type ItemAction } from './listModel'

export function runAction(action: ItemAction): void {
  switch (action.kind) {
    case 'push':
      nav.push(action.screen, action.params ?? {})
      break
    case 'play': {
      const items = action.items()
      if (items.length === 0) return
      void player.playList(items, action.startId, action.shuffle)
      nav.push('nowPlaying')
      break
    }
    case 'run':
      action.run()
      break
    default:
      break
  }
}

export function listInput(e: InputEvent, screen: Screen): boolean {
  const def = listDef(screen.kind)
  if (!def) return false
  const items = listItems(screen)
  const length = items.length
  switch (e.type) {
    case 'rotate': {
      if (length === 0) return false
      const rows = rowsPerDetent(e.velocity, length)
      const sel = moveSelection(screen.sel, e.steps * rows, length)
      if (sel === screen.sel) return false
      const first = scrollWindow(screen.first, sel, VISIBLE_ROWS, length)
      nav.update({ sel, first })
      if (def.letters && length > VISIBLE_ROWS && Math.abs(e.velocity) >= 8) {
        const letter = items[sel]?.letter
        if (letter) ui.showLetter(letter)
      }
      return true
    }
    case 'press': {
      if (e.button !== 'center') return false
      const item = items[screen.sel]
      if (!item) return true
      runAction(item.action)
      return true
    }
    case 'hold': {
      if (e.button !== 'center') return false
      const item = items[screen.sel]
      if (!item?.otgTrackIds?.length) return true
      const ids = item.otgTrackIds
      ui.blinkRow()
      if (ids.length === 1) {
        void library.toggleOnTheGo(ids[0]!, t('onTheGo')).then((added) => ui.toast(t(added ? 'addedToOnTheGo' : 'removedFromOnTheGo')))
      } else {
        void (async () => {
          for (const id of ids) {
            const p = library.playlist('otg')
            if (!p || !p.trackIds.includes(id)) await library.toggleOnTheGo(id, t('onTheGo'))
          }
          ui.toast(t('addedToOnTheGo'))
        })()
      }
      return true
    }
    default:
      return false
  }
}
