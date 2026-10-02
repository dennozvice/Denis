import type { AppointmentType, DateKey } from '../../domain/types'

export interface MiniCalendarProps {
  /** Un qualunque giorno del mese da mostrare. */
  month: DateKey
  today: DateKey
  selected?: DateKey
  /** Tipi di appuntamento per giorno (pallini colorati). */
  marks?: Map<DateKey, AppointmentType[]>
  onSelect(day: DateKey): void
  onMonthChange(month: DateKey): void
}

/** STUB — da implementare: calendario mensile compatto (lun→dom) con pallini sugli appuntamenti. */
export function MiniCalendar(props: MiniCalendarProps) {
  void props
  return null
}
