import { useMemo } from 'react'
import type { PageId } from '../../router/router'
import { useNow } from '../../store/NowContext'
import { useAppData } from '../../store/StoreContext'
import { todayTasks } from '../../store/selectors'

/** Contatori mostrati accanto alle voci di navigazione. `alert` = rosso (c'è qualcosa in ritardo). */
export function useNavCounts(): Partial<Record<PageId, { count: number; alert: boolean }>> {
  const data = useAppData()
  const now = useNow()
  return useMemo(() => {
    const t = todayTasks(data.tasks, now.date)
    const openCases = data.cases.filter((c) => c.status !== 'chiusa').length
    return {
      attivita: { count: t.overdue.length + t.today.length, alert: t.overdue.length > 0 },
      pratiche: { count: openCases, alert: false },
    }
  }, [data.tasks, data.cases, now.date])
}
