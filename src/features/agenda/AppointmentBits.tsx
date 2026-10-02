/** Piccoli elementi condivisi da widget e pagina Agenda: icona del luogo, pill di stato, testo del luogo. */
import { Building2, MapPin, Phone, Video } from 'lucide-react'
import { Pill } from '../../components/ui/Pill'
import type { Tone } from '../../domain/labels'
import {
  APPOINTMENT_OUTCOME_LABEL,
  APPOINTMENT_TYPE_LABEL,
  APPOINTMENT_TYPE_TONE,
  LOCATION_LABEL,
  TONE_BG,
  TONE_COLOR,
} from '../../domain/labels'
import type { Appointment, AppointmentOutcome, Client, LocationMode } from '../../domain/types'
import { clientFullName } from '../../store/selectors'
import { videoHref, type Phase } from './agendaUtils'

export function LocationIcon({ mode, size = 14 }: { mode: LocationMode; size?: number }) {
  switch (mode) {
    case 'ufficio':
      return <Building2 size={size} aria-hidden="true" />
    case 'domicilio':
      return <MapPin size={size} aria-hidden="true" />
    case 'video':
      return <Video size={size} aria-hidden="true" />
    case 'telefono':
      return <Phone size={size} aria-hidden="true" />
  }
}

/** Testo del luogo: dettaglio (indirizzo, sala…) oppure l'etichetta generica. I link non vengono mostrati per intero. */
export function locationText(a: Pick<Appointment, 'location' | 'locationDetail'>): string {
  const detail = a.locationDetail?.trim()
  if (!detail || a.location === 'telefono' || (a.location === 'video' && videoHref(detail)))
    return LOCATION_LABEL[a.location]
  return detail
}

export const OUTCOME_TONE: Record<AppointmentOutcome, Tone> = {
  positivo: 'positive',
  da_ricontattare: 'warning',
  negativo: 'negative',
}

export const OUTCOME_TEXT: Record<AppointmentOutcome, string> = {
  positivo: 'Esito positivo',
  da_ricontattare: APPOINTMENT_OUTCOME_LABEL.da_ricontattare,
  negativo: 'Esito negativo',
}

/** Pill che descrive lo stato dell'appuntamento (nulla se è semplicemente confermato e futuro). */
export function StatusPill({ appointment: a, phase }: { appointment: Appointment; phase: Phase }) {
  if (a.status === 'annullato') return <Pill tone="neutral">Annullato</Pill>
  if (phase === 'in_corso') {
    return (
      <Pill tone="primary">
        <span className="ag-live-dot" aria-hidden="true" />
        In corso
      </Pill>
    )
  }
  if (a.outcome) return <Pill tone={OUTCOME_TONE[a.outcome]}>{OUTCOME_TEXT[a.outcome]}</Pill>
  if (a.status === 'pianificato' && phase === 'futuro') return <Pill tone="warning">Da confermare</Pill>
  if (a.status === 'svolto') return <Pill tone="neutral">Svolto</Pill>
  return null
}

/** Variabili CSS del colore del tipo (barra laterale e sfondo dei blocchi). */
export function typeStyle(a: Pick<Appointment, 'type'>): React.CSSProperties {
  const tone = APPOINTMENT_TYPE_TONE[a.type]
  return { '--ag-type': TONE_COLOR[tone], '--ag-type-bg': TONE_BG[tone] } as React.CSSProperties
}

/** Descrizione completa per lettori di schermo: "09:30–10:30, Revisione portafoglio, Mario Rossi, In ufficio, Da confermare". */
export function appointmentAriaLabel(a: Appointment, client: Client | undefined, phase: Phase): string {
  const parts = [`${a.start}–${a.end}`, a.title, APPOINTMENT_TYPE_LABEL[a.type]]
  if (client) parts.push(clientFullName(client))
  parts.push(locationText(a))
  if (a.status === 'annullato') parts.push('annullato')
  else if (phase === 'in_corso') parts.push('in corso')
  else if (a.outcome) parts.push(OUTCOME_TEXT[a.outcome].toLowerCase())
  else if (a.status === 'pianificato' && phase === 'futuro') parts.push('da confermare')
  return parts.join(', ')
}
