/**
 * Notifiche temporanee in basso ("Attività completata · Annulla").
 * Accessibilità: restano visibili più a lungo se hanno un'azione, si fermano quando il mouse o
 * il focus ci sono sopra, e l'ultima azione "Annulla" si può eseguire anche con Ctrl+Z (⌘Z).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export interface ToastOptions {
  message: string
  actionLabel?: string
  onAction?(): void
  /** Durata in ms (default 5000; 10000 se c'è un'azione). */
  duration?: number
}

interface ToastItem extends ToastOptions {
  id: number
}

const ToastContext = createContext<((options: ToastOptions) => void) | null>(null)

const isEditable = (el: Element | null) =>
  !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el as HTMLElement).isContentEditable)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, { timer: number; remaining: number; started: number }>())
  const latest = useRef<ToastItem[]>([])

  useEffect(() => {
    latest.current = items
  }, [items])

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id)
    if (t) window.clearTimeout(t.timer)
    timers.current.delete(id)
    setItems((list) => list.filter((x) => x.id !== id))
  }, [])

  const schedule = useCallback(
    (id: number, ms: number) => {
      const timer = window.setTimeout(() => dismiss(id), ms)
      timers.current.set(id, { timer, remaining: ms, started: Date.now() })
    },
    [dismiss],
  )

  const show = useCallback(
    (options: ToastOptions) => {
      const id = nextId.current++
      setItems((list) => {
        // al massimo 3 notifiche: le più vecchie spariscono
        for (const old of list.slice(0, Math.max(0, list.length - 2))) {
          const t = timers.current.get(old.id)
          if (t) window.clearTimeout(t.timer)
          timers.current.delete(old.id)
        }
        return [...list.slice(-2), { ...options, id }]
      })
      schedule(id, options.duration ?? (options.onAction ? 10000 : 5000))
    },
    [schedule],
  )

  const pause = useCallback((id: number) => {
    const t = timers.current.get(id)
    if (!t) return
    window.clearTimeout(t.timer)
    t.remaining = Math.max(1500, t.remaining - (Date.now() - t.started))
  }, [])

  const resume = useCallback(
    (id: number) => {
      const t = timers.current.get(id)
      if (t) schedule(id, t.remaining)
    },
    [schedule],
  )

  // Ctrl+Z / ⌘Z = esegue l'azione dell'ultima notifica (di solito "Annulla"), se non si sta scrivendo in un campo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return
      if (isEditable(document.activeElement)) return
      const last = [...latest.current].reverse().find((t) => t.onAction)
      if (!last) return
      e.preventDefault()
      last.onAction?.()
      dismiss(last.id)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [dismiss])

  useEffect(() => {
    const map = timers.current
    return () => map.forEach((t) => window.clearTimeout(t.timer))
  }, [])

  const value = useMemo(() => show, [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className="toast"
            onMouseEnter={() => pause(t.id)}
            onMouseLeave={() => resume(t.id)}
            onFocus={() => pause(t.id)}
            onBlur={() => resume(t.id)}
          >
            <span className="grow">{t.message}</span>
            {t.actionLabel && t.onAction && (
              <button
                type="button"
                title={`${t.actionLabel} (Ctrl+Z)`}
                aria-keyshortcuts="Control+Z"
                onClick={() => {
                  t.onAction?.()
                  dismiss(t.id)
                }}
              >
                {t.actionLabel}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

/** const toast = useToast(); toast({ message: 'Salvato' }) */
export function useToast(): (options: ToastOptions) => void {
  const v = useContext(ToastContext)
  if (!v) throw new Error('useToast deve essere usato dentro <ToastProvider>')
  return v
}
