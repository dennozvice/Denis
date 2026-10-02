/** Notifiche temporanee in basso ("Attività completata · Annulla"). */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

export interface ToastOptions {
  message: string
  actionLabel?: string
  onAction?(): void
  /** Durata in ms (default 5000). */
  duration?: number
}

interface ToastItem extends ToastOptions {
  id: number
}

const ToastContext = createContext<((options: ToastOptions) => void) | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), [])

  const show = useCallback(
    (options: ToastOptions) => {
      const id = nextId.current++
      setItems((list) => [...list.slice(-2), { ...options, id }])
      window.setTimeout(() => dismiss(id), options.duration ?? 5000)
    },
    [dismiss],
  )

  const value = useMemo(() => show, [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="toast">
            <span className="grow">{t.message}</span>
            {t.actionLabel && t.onAction && (
              <button
                type="button"
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
