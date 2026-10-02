import {
  CalendarDays,
  ChartLine,
  CornerDownLeft,
  FolderOpen,
  ListChecks,
  Search,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react'
import { useMarket } from '../../store/MarketContext'
import { useNow } from '../../store/NowContext'
import { useAppData } from '../../store/StoreContext'
import { highlightRanges, searchAll, tokenize, type SearchGroupId, type SearchResult } from './searchUtils'
import './shell.css'

const GROUP_ICON: Record<SearchGroupId, LucideIcon> = {
  clienti: Users,
  attivita: ListChecks,
  appuntamenti: CalendarDays,
  pratiche: FolderOpen,
  fondi: ChartLine,
}

const MOBILE_QUERY = '(max-width: 767px)'
const PLACEHOLDER = 'Cerca clienti, attività, fondi…'

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/**
 * Ricerca globale nella topbar.
 * Desktop/tablet: campo sempre visibile (Ctrl/⌘+K oppure "/" per attivarlo).
 * Smartphone: icona che apre una ricerca a schermo intero.
 */
export function GlobalSearch() {
  const [isMac] = useState(() => typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform))
  const [overlayOpen, setOverlayOpen] = useState(false)
  const inlineInputRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDialogElement>(null)
  const overlayInputRef = useRef<HTMLInputElement>(null)

  // Scorciatoie da tastiera: Ctrl/⌘+K ovunque, "/" quando non si sta scrivendo in un campo.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isK = (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k'
      const isSlash = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !isEditable(e.target)
      if (!isK && !isSlash) return
      if (overlayRef.current?.open) {
        e.preventDefault()
        overlayInputRef.current?.focus()
        return
      }
      // Con una finestra modale aperta la ricerca non è raggiungibile: si lascia stare.
      if (document.querySelector('dialog[open]')) return
      e.preventDefault()
      if (window.matchMedia(MOBILE_QUERY).matches) {
        setOverlayOpen(true)
      } else {
        inlineInputRef.current?.focus()
        inlineInputRef.current?.select()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  // Apertura/chiusura della ricerca a schermo intero (dialog modale nativo: focus e tasto Esc gestiti dal browser).
  useEffect(() => {
    const dialog = overlayRef.current
    if (!dialog) return
    if (overlayOpen && !dialog.open) {
      dialog.showModal()
      overlayInputRef.current?.focus()
    }
    if (!overlayOpen && dialog.open) dialog.close()
  }, [overlayOpen])

  const shortcut = isMac ? '⌘K' : 'Ctrl K'
  const keyshortcuts = isMac ? 'Meta+K /' : 'Control+K /'

  return (
    <>
      <div className="sh-search-inline">
        <SearchBox variant="inline" inputRef={inlineInputRef} shortcut={shortcut} keyshortcuts={keyshortcuts} />
      </div>
      <button
        type="button"
        className="icon-btn sh-icon-btn sh-search-trigger"
        aria-label="Cerca"
        aria-haspopup="dialog"
        title="Cerca"
        onClick={() => setOverlayOpen(true)}
      >
        <Search size={20} aria-hidden="true" />
      </button>
      <dialog
        ref={overlayRef}
        className="sh-overlay"
        aria-label="Ricerca"
        onCancel={(e) => {
          e.preventDefault()
          setOverlayOpen(false)
        }}
        onClose={() => setOverlayOpen(false)}
      >
        {overlayOpen && <SearchBox variant="overlay" inputRef={overlayInputRef} onClose={() => setOverlayOpen(false)} />}
      </dialog>
    </>
  )
}

interface SearchBoxProps {
  variant: 'inline' | 'overlay'
  inputRef?: Ref<HTMLInputElement>
  /** Suggerimento visivo della scorciatoia (es. "Ctrl K"). */
  shortcut?: string
  keyshortcuts?: string
  /** Solo per la variante a schermo intero. */
  onClose?(): void
}

/** Campo di ricerca con elenco dei risultati (pattern ARIA "combobox" + "listbox"). */
function SearchBox({ variant, inputRef, shortcut, keyshortcuts, onClose }: SearchBoxProps) {
  const data = useAppData()
  const { instruments } = useMarket()
  const now = useNow()
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const baseId = useId()
  const listId = `${baseId}-list`
  const optionId = (i: number) => `${baseId}-opt-${i}`

  const tokens = useMemo(() => tokenize(query), [query])
  const groups = useMemo(
    () => (tokens.length > 0 ? searchAll(data, instruments, query, now.date) : []),
    [tokens, data, instruments, query, now.date],
  )
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups])
  const hasQuery = tokens.length > 0
  const overlay = variant === 'overlay'
  const expanded = hasQuery && !dismissed && (overlay || focused)
  const active = expanded && flat.length > 0 ? Math.min(activeIndex, flat.length - 1) : -1

  // L'opzione attiva resta visibile quando ci si sposta con le frecce.
  useEffect(() => {
    if (active < 0) return
    document.getElementById(`${baseId}-opt-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [active, baseId])

  const reset = () => {
    setQuery('')
    setActiveIndex(0)
    setDismissed(false)
  }

  const open = (result: SearchResult) => {
    reset()
    if (overlay) onClose?.()
    window.location.hash = result.href
    // Il focus passa al contenuto della pagina (la pagina di destinazione può poi spostarlo, es. su un dettaglio).
    if (!overlay) document.getElementById('contenuto')?.focus({ preventScroll: true })
  }

  const move = (delta: number) => {
    if (dismissed) {
      setDismissed(false)
      return
    }
    if (flat.length === 0) return
    const from = active < 0 ? (delta > 0 ? -1 : 0) : active
    setActiveIndex((from + delta + flat.length) % flat.length)
  }

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        if (!hasQuery) return
        e.preventDefault()
        move(e.key === 'ArrowDown' ? 1 : -1)
        break
      case 'Enter':
        if (active >= 0) {
          e.preventDefault()
          open(flat[active])
        }
        break
      case 'Escape':
        // Nella ricerca a schermo intero Esc chiude tutto (lo gestisce il <dialog>).
        if (overlay) return
        e.preventDefault()
        if (expanded) setDismissed(true)
        else if (query) reset()
        else e.currentTarget.blur()
        break
    }
  }

  const trimmed = query.trim()
  // Indice (nell'elenco piatto) della prima opzione di ogni gruppo.
  const groupStart: number[] = []
  for (let i = 0, n = 0; i < groups.length; i++) {
    groupStart.push(n)
    n += groups[i].items.length
  }

  return (
    <div className={`sh-search sh-search--${variant}`}>
      <div className="sh-search-field">
        <div className="sh-search-box">
          <Search className="sh-search-icon" size={overlay ? 20 : 18} aria-hidden="true" />
          <input
            ref={inputRef}
            className="sh-search-input"
            type="text"
            role="combobox"
            aria-label="Cerca clienti, attività, appuntamenti, pratiche e fondi"
            aria-expanded={expanded}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? optionId(active) : undefined}
            aria-keyshortcuts={keyshortcuts}
            placeholder={PLACEHOLDER}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveIndex(0)
              setDismissed(false)
            }}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
          {query ? (
            <button
              type="button"
              className="sh-search-clear"
              aria-label="Cancella la ricerca"
              title="Cancella"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                reset()
                e.currentTarget.parentElement?.querySelector('input')?.focus()
              }}
            >
              <X size={16} aria-hidden="true" />
            </button>
          ) : (
            shortcut && (
              <kbd className="sh-kbd" aria-hidden="true">
                {shortcut}
              </kbd>
            )
          )}
        </div>
        {overlay && (
          <button type="button" className="btn btn-ghost sh-overlay-close" onClick={onClose}>
            Chiudi
          </button>
        )}
      </div>

      <div className="sh-results" hidden={!expanded} onMouseDown={(e) => e.preventDefault()}>
        <div role="listbox" id={listId} aria-label="Risultati della ricerca" className="sh-listbox">
          {expanded &&
            groups.map((g, gi) => {
              const Icon = GROUP_ICON[g.id]
              const labelId = `${baseId}-group-${g.id}`
              return (
                <div key={g.id} role="group" aria-labelledby={labelId} className="sh-group">
                  <div role="presentation" id={labelId} className="sh-group-label">
                    <Icon size={14} aria-hidden="true" />
                    <span className="grow">{g.label}</span>
                    {g.total > g.items.length && (
                      <span className="sh-group-count">
                        {g.items.length} di {g.total}
                      </span>
                    )}
                  </div>
                  {g.items.map((r, j) => {
                    const i = groupStart[gi] + j
                    const selected = i === active
                    return (
                      <div
                        key={r.key}
                        id={optionId(i)}
                        role="option"
                        aria-selected={selected}
                        className="sh-option"
                        onMouseMove={() => {
                          if (!selected) setActiveIndex(i)
                        }}
                        onClick={() => open(r)}
                      >
                        <span className="sh-option-text">
                          <span className="sh-option-title">
                            <Highlight text={r.title} tokens={tokens} />
                          </span>
                          <span className="sh-option-detail">{r.detail}</span>
                        </span>
                        {selected && <CornerDownLeft className="sh-option-enter" size={16} aria-hidden="true" />}
                      </div>
                    )
                  })}
                </div>
              )
            })}
        </div>
        {expanded && flat.length === 0 && (
          <p className="sh-noresults">
            Nessun risultato per <strong>«{trimmed}»</strong>
          </p>
        )}
        {expanded && flat.length > 0 && !overlay && (
          <p className="sh-results-foot" aria-hidden="true">
            <span>
              <kbd>↑</kbd>
              <kbd>↓</kbd> per spostarti
            </span>
            <span>
              <kbd>Invio</kbd> per aprire
            </span>
            <span>
              <kbd>Esc</kbd> per chiudere
            </span>
          </p>
        )}
      </div>

      {overlay && !hasQuery && (
        <p className="sh-overlay-hint">Cerca per nome del cliente, attività, appuntamento, pratica o fondo.</p>
      )}

      <p className="visually-hidden" role="status" aria-live="polite">
        {hasQuery ? (flat.length > 0 ? `${flat.length} risultati` : 'Nessun risultato') : ''}
      </p>
    </div>
  )
}

/** Evidenzia in grassetto le parti del testo che corrispondono alla ricerca. */
function Highlight({ text, tokens }: { text: string; tokens: string[] }) {
  const ranges = highlightRanges(text, tokens)
  if (ranges.length === 0) return <>{text}</>
  const parts: ReactNode[] = []
  let pos = 0
  ranges.forEach(([start, end], i) => {
    if (start > pos) parts.push(text.slice(pos, start))
    parts.push(
      <mark key={i} className="sh-mark">
        {text.slice(start, end)}
      </mark>,
    )
    pos = end
  })
  if (pos < text.length) parts.push(text.slice(pos))
  return <>{parts}</>
}
