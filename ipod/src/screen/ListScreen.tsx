/** Schermata-lista generica: usa la definizione registrata per il tipo di schermata. */
import type { Screen } from '../core/navigation'
import { listDef, listItems } from './listModel'
import { MenuList } from './MenuList'
import { SplitPane } from './SplitPane'

export function ListScreen({ screen }: { screen: Screen }) {
  const def = listDef(screen.kind)
  if (!def) return null
  const items = listItems(screen)
  const empty = items.length === 0 ? def.empty?.(screen) ?? null : null
  const pane = def.split ? items[screen.sel]?.pane ?? 'slideshow' : null
  return (
    <>
      <MenuList items={items} sel={screen.sel} first={screen.first} split={def.split} letters={def.letters} />
      {pane && <SplitPane kind={pane} />}
      {empty && (
        <div className="msg" style={{ top: 96, fontSize: 14, color: '#6e6e6e' }}>
          {empty}
        </div>
      )}
    </>
  )
}
