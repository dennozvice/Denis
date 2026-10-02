/** Orologio condiviso: data e ora di Roma, aggiornate ogni 30 secondi e al ritorno sulla scheda. */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { nowInRome, type RomeNow } from '../lib/dates'

const NowContext = createContext<RomeNow | null>(null)

export function NowProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState<RomeNow>(() => nowInRome())
  useEffect(() => {
    const tick = () =>
      setNow((prev) => {
        const next = nowInRome()
        return next.date === prev.date && next.time === prev.time ? prev : next
      })
    const timer = window.setInterval(tick, 30_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])
  return <NowContext.Provider value={now}>{children}</NowContext.Provider>
}

/** Data e ora correnti (Europe/Rome). `now.date` è "oggi". */
export function useNow(): RomeNow {
  const value = useContext(NowContext)
  if (!value) throw new Error('useNow deve essere usato dentro <NowProvider>')
  return value
}
