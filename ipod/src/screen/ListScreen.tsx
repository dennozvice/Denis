/** Schermata-lista generica: usa la definizione registrata per il tipo di schermata. */
import type { Screen } from '../core/navigation'
import { useStore } from '../core/store'
import { scrollWindow } from '../device/wheelMath'
import { listDef, listItems, listVersionStore, VISIBLE_ROWS } from './listModel'
import { MenuList } from './MenuList'
import { SplitPane } from './SplitPane'

export function ListScreen({ screen }: { screen: Screen }) {
  useStore(listVersionStore) // ridisegna quando cambiano libreria, lettore, impostazioni o sincronizzazione
  const def = listDef(screen.kind)
  if (!def) return null
  const items = listItems(screen)
  // Se la lista si è accorciata sotto il cursore (es. brano tolto dalla On-The-Go) la selezione resta valida.
  const sel = Math.max(0, Math.min(screen.sel, items.length - 1))
  const first = scrollWindow(Math.min(screen.first, Math.max(0, items.length - VISIBLE_ROWS)), sel, VISIBLE_ROWS, items.length)
  const empty = items.length === 0 ? def.empty?.(screen) ?? null : null
  const pane = def.split ? items[sel]?.pane ?? 'slideshow' : null
  return (
    <>
      <MenuList items={items} sel={sel} first={first} split={def.split} letters={def.letters} />
      {pane && <SplitPane kind={pane} />}
      {empty && (
        <div className="msg" style={{ top: 96, fontSize: 14, color: '#6e6e6e' }}>
          {empty}
        </div>
      )}
    </>
  )
}
