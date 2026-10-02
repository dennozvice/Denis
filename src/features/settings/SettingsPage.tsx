import {
  ArrowRight,
  CircleAlert,
  FileText,
  HardDrive,
  Lock,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Card } from '../../components/ui/Card'
import { DemoBadge } from '../../components/ui/DemoBadge'
import { Segmented } from '../../components/ui/Segmented'
import { useToast } from '../../components/ui/Toast'
import { DEFAULT_SETTINGS } from '../../data/demoSeed'
import type { ThemePreference } from '../../domain/types'
import { formatNumber, plural } from '../../lib/format'
import { buildHref } from '../../router/router'
import { useMarket } from '../../store/MarketContext'
import { useNow } from '../../store/NowContext'
import { clientsToRecontact, computeDeadlines } from '../../store/selectors'
import { useActions, useAppData } from '../../store/StoreContext'
import { BackupSection } from './BackupSection'
import { APP_VERSION, IDD_MONTHS, parseIntInRange, RECONTACT_DAYS } from './settingsUtils'
import './settings.css'

const THEME_OPTIONS: { value: ThemePreference; label: string; title: string }[] = [
  { value: 'sistema', label: 'Sistema', title: 'Segue la modalità chiara o scura del dispositivo' },
  { value: 'chiaro', label: 'Chiaro', title: 'Sempre chiaro' },
  { value: 'scuro', label: 'Scuro', title: 'Sempre scuro' },
]

/** Pagina Impostazioni (#/impostazioni). */
export function SettingsPage() {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Impostazioni</h1>
          <p>Profilo, aspetto, regole dei promemoria, backup e privacy. Tutto resta salvato solo in questo browser.</p>
        </div>
      </header>
      <div className="sh-set-cols">
        <div className="sh-set-col">
          <ProfileSection />
          <AppearanceSection />
          <RulesSection />
          <IntegrationsSection />
        </div>
        <div className="sh-set-col">
          <BackupSection />
          <PrivacySection />
          <InfoSection />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Profilo

function ProfileSection() {
  const { settings } = useAppData()
  const { updateSettings } = useActions()
  return (
    <Card id="sh-set-profilo" title="Profilo" subtitle="Le modifiche vengono salvate automaticamente.">
      <div className="form">
        <TextField
          id="sh-set-advisor"
          label="Nome del consulente"
          value={settings.advisorName}
          autoComplete="name"
          hint="Compare nel saluto in alto e nelle iniziali dell’avatar."
          onChange={(advisorName) => updateSettings({ advisorName })}
        />
        <TextField
          id="sh-set-agency"
          label="Agenzia / ufficio"
          value={settings.agencyName}
          autoComplete="organization"
          placeholder="Es. Agenzia di Milano Centro"
          hint="Facoltativo: compare sotto il nome dell’app nella barra laterale."
          onChange={(agencyName) => updateSettings({ agencyName })}
        />
        <TextField
          id="sh-set-brand"
          label="Nome dell’app"
          value={settings.brandName}
          fallback={DEFAULT_SETTINGS.brandName}
          hint="È il nome mostrato in alto a sinistra. Non inserire loghi o marchi aziendali senza autorizzazione."
          onChange={(brandName) => updateSettings({ brandName })}
        />
      </div>
    </Card>
  )
}

interface TextFieldProps {
  id: string
  label: string
  value: string
  hint?: string
  placeholder?: string
  autoComplete?: string
  /** Valore usato se il campo viene lasciato vuoto. */
  fallback?: string
  onChange(value: string): void
}

/** Campo di testo salvato a ogni modifica; all'uscita dal campo toglie gli spazi superflui. */
function TextField({ id, label, value, hint, placeholder, autoComplete, fallback = '', onChange }: TextFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input"
        type="text"
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        maxLength={80}
        aria-describedby={hintId}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          const clean = e.target.value.trim().replace(/\s+/g, ' ') || fallback
          if (clean !== e.target.value) onChange(clean)
        }}
      />
      {hint && (
        <p className="field-hint" id={hintId}>
          {hint}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Aspetto

function AppearanceSection() {
  const { settings } = useAppData()
  const { updateSettings } = useActions()
  return (
    <Card id="sh-set-aspetto" title="Aspetto">
      <div className="field">
        <span className="field-label">Tema</span>
        <div className="sh-set-theme">
          <Segmented
            ariaLabel="Tema"
            options={THEME_OPTIONS}
            value={settings.theme}
            onChange={(theme) => updateSettings({ theme })}
          />
        </div>
        <p className="field-hint">
          «Sistema» segue la modalità chiara o scura del dispositivo. Puoi cambiare tema anche dall’icona in alto a destra.
        </p>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------- Regole

function RulesSection() {
  const data = useAppData()
  const { settings } = data
  const { updateSettings } = useActions()
  const now = useNow()

  const idd = useMemo(() => {
    const list = computeDeadlines(data, now.date, { horizonDays: 30 }).filter((d) => d.kind === 'adeguatezza')
    return { expired: list.filter((d) => d.daysLeft < 0).length, soon: list.filter((d) => d.daysLeft >= 0).length }
  }, [data, now.date])
  const recontact = useMemo(
    () => clientsToRecontact(data.clients, now.date, settings.recontactAfterDays).length,
    [data.clients, now.date, settings.recontactAfterDays],
  )

  return (
    <Card
      id="sh-set-regole"
      title="Regole e promemoria"
      subtitle="Servono a calcolare scadenze, notifiche e clienti da ricontattare."
    >
      <div className="form">
        <NumberField
          id="sh-set-idd"
          label="Validità del questionario di adeguatezza"
          unit="mesi"
          value={settings.iddValidityMonths}
          min={IDD_MONTHS.min}
          max={IDD_MONTHS.max}
          onCommit={(iddValidityMonths) => updateSettings({ iddValidityMonths })}
          hint={`Trascorso questo periodo dall’ultima compilazione, il questionario (IDD/MiFID) risulta da rinnovare e compare tra le scadenze. Verifica la durata prevista dalla tua compagnia. Predefinito: ${IDD_MONTHS.fallback} mesi.`}
          effect={
            <>
              Oggi: <strong className="num">{formatNumber(idd.expired)}</strong> {idd.expired === 1 ? 'questionario scaduto' : 'questionari scaduti'} e{' '}
              <strong className="num">{formatNumber(idd.soon)}</strong> in scadenza entro 30 giorni.
            </>
          }
        />
        <NumberField
          id="sh-set-recontact"
          label="Ricontattare i clienti dopo"
          unit="giorni"
          value={settings.recontactAfterDays}
          min={RECONTACT_DAYS.min}
          max={RECONTACT_DAYS.max}
          onCommit={(recontactAfterDays) => updateSettings({ recontactAfterDays })}
          hint={`I clienti con polizze attive senza un contatto (incontro o telefonata) da più di questi giorni vengono segnalati come da ricontattare. Predefinito: ${RECONTACT_DAYS.fallback} giorni.`}
          effect={
            <>
              Oggi: <strong className="num">{plural(recontact, 'cliente', 'clienti')}</strong> da ricontattare.{' '}
              <a href={buildHref('clienti')}>Vai ai clienti</a>
            </>
          }
        />
      </div>
    </Card>
  )
}

interface NumberFieldProps {
  id: string
  label: string
  unit: string
  value: number
  min: number
  max: number
  hint: string
  /** Conseguenza dell'impostazione sui dati attuali. */
  effect?: ReactNode
  onCommit(value: number): void
}

/**
 * Campo numerico: il testo digitato resta locale finché non è un intero valido nell'intervallo,
 * poi viene salvato. Se il valore cambia altrove (es. import di un backup) il campo si riallinea.
 */
function NumberField({ id, label, unit, value, min, max, hint, effect, onCommit }: NumberFieldProps) {
  const [text, setText] = useState(String(value))
  const [synced, setSynced] = useState(value)
  if (value !== synced) {
    setSynced(value)
    setText(String(value))
  }
  const valid = parseIntInRange(text, min, max) !== null
  const errorId = `${id}-error`
  const hintId = `${id}-hint`

  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="sh-set-number">
        <input
          id={id}
          className="input num"
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          value={text}
          aria-invalid={!valid}
          aria-describedby={valid ? hintId : `${errorId} ${hintId}`}
          onChange={(e) => {
            const next = e.target.value
            setText(next)
            const n = parseIntInRange(next, min, max)
            if (n !== null && n !== value) {
              setSynced(n)
              onCommit(n)
            }
          }}
          onBlur={() => {
            if (!valid) setText(String(value))
          }}
        />
        <span className="sh-set-unit">{unit}</span>
        <span className="sh-set-range xsmall muted">
          da {formatNumber(min)} a {formatNumber(max)}
        </span>
      </div>
      <p id={errorId} className="sh-set-error" aria-live="polite">
        {valid ? '' : `Inserisci un numero intero da ${formatNumber(min)} a ${formatNumber(max)}.`}
      </p>
      <p className="field-hint" id={hintId}>
        {hint}
      </p>
      {effect && <p className="sh-set-effect">{effect}</p>}
    </div>
  )
}

// ---------------------------------------------------------------- Privacy

const PRIVACY_POINTS: { icon: LucideIcon; text: ReactNode }[] = [
  {
    icon: HardDrive,
    text: (
      <>
        I dati sono salvati <strong>solo in questo browser</strong> (localStorage): non vengono inviati a nessun server,{' '}
        <strong>non sono cifrati</strong> e non si sincronizzano con altri dispositivi.
      </>
    ),
  },
  {
    icon: UsersRound,
    text: <>Non usare l’app su PC condivisi o pubblici: chiunque usi lo stesso browser può vedere i dati.</>,
  },
  {
    icon: CircleAlert,
    text: (
      <>
        Evita dati sensibili: informazioni sulla salute, codici fiscali completi, numeri di polizza interi (usa riferimenti
        mascherati, es. ••••4821).
      </>
    ),
  },
  {
    icon: ShieldCheck,
    text: (
      <>
        Prima di inserire dati reali dei clienti verifica le regole della tua compagnia: GDPR, informativa privacy e uso del
        CRM aziendale ufficiale.
      </>
    ),
  },
  {
    icon: FileText,
    text: <>Esporta regolarmente un backup: se cancelli i dati di navigazione o cambi computer, i dati andranno persi.</>,
  },
  {
    icon: Lock,
    text: <>Il sito pubblicato (es. GitHub Pages) contiene solo il codice dell’app, mai i tuoi dati.</>,
  },
]

function PrivacySection() {
  const { settings } = useAppData()
  const { updateSettings } = useActions()
  const toast = useToast()
  return (
    <Card id="sh-set-privacy" title="Privacy">
      <ul className="sh-set-points">
        {PRIVACY_POINTS.map(({ icon: Icon, text }, i) => (
          <li key={i}>
            <Icon size={18} aria-hidden="true" />
            <span>{text}</span>
          </li>
        ))}
      </ul>
      <div className="sh-set-inline-action">
        <button
          type="button"
          className="btn"
          disabled={!settings.privacyNoticeDismissed}
          onClick={() => {
            updateSettings({ privacyNoticeDismissed: false })
            toast({ message: 'L’avviso privacy è di nuovo visibile in cima alla pagina.' })
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
        >
          <ShieldCheck size={16} aria-hidden="true" />
          Mostra di nuovo l’avviso privacy
        </button>
        {!settings.privacyNoticeDismissed && <span className="xsmall muted">L’avviso è già visibile in cima alla pagina.</span>}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------- Dati di mercato e integrazioni

function IntegrationsSection() {
  const { instruments, imports, hasDemo, status } = useMarket()
  const demoCount = instruments.filter((i) => i.source === 'demo').length
  return (
    <Card
      id="sh-set-integrazioni"
      title="Dati di mercato e integrazioni"
      badge={hasDemo ? <DemoBadge /> : undefined}
    >
      <div className="sh-set-block">
        <h3>Fondi e mercati</h3>
        <p>
          I valori di fondi, gestione separata, indici, tassi e cambi sono <strong>simulati</strong> finché non importi le
          quotazioni ufficiali da un file CSV (ad esempio scaricato dall’area riservata della compagnia).
        </p>
        {status === 'ready' && (
          <p className="xsmall muted">
            Strumenti con valori dimostrativi: <span className="num">{formatNumber(demoCount)}</span> · Serie di prezzi
            importate: <span className="num">{formatNumber(imports.length)}</span>
          </p>
        )}
        <a className="sh-set-link" href={buildHref('fondi')}>
          Vai a Fondi e mercati <ArrowRight size={14} aria-hidden="true" />
        </a>
      </div>
      <div className="sh-set-block">
        <h3>Calendario</h3>
        <p>
          Puoi importare appuntamenti da Outlook, Google Calendar o Calendario di Apple con un file <strong>.ics</strong> ed
          esportare l’agenda nello stesso formato.
        </p>
        <a className="sh-set-link" href={buildHref('agenda')}>
          Vai all’Agenda <ArrowRight size={14} aria-hidden="true" />
        </a>
      </div>
      <div className="sh-set-block">
        <h3>Integrazioni possibili in futuro</h3>
        <ul className="sh-set-bullets">
          <li>
            Sincronizzazione con il calendario Outlook / Microsoft 365 tramite Microsoft Graph: richiede l’approvazione
            dell’IT aziendale e la registrazione di un’applicazione.
          </li>
          <li>Quotazioni ufficiali dei fondi da un fornitore di dati autorizzato, al posto dei valori dimostrativi.</li>
        </ul>
        <p className="xsmall muted">Oggi nessuna integrazione è attiva: l’app non si collega a servizi esterni.</p>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------- Informazioni

function InfoSection() {
  const { settings } = useAppData()
  const rows: { label: string; value: ReactNode }[] = [
    { label: 'Applicazione', value: settings.brandName },
    { label: 'Versione', value: <span className="num">{APP_VERSION}</span> },
    { label: 'Archiviazione', value: 'Solo in questo browser' },
    { label: 'Fuso orario', value: 'Europe/Rome (ora italiana)' },
  ]
  return (
    <Card id="sh-set-info" title="Informazioni">
      <dl className="sh-set-info">
        {rows.map((r) => (
          <div key={r.label}>
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>
      <p className="sh-set-disclaimer">
        Progetto personale non ufficiale: non affiliato né approvato da alcuna compagnia assicurativa. I nomi dei fondi e i
        valori di mercato mostrati di default sono simulati.
      </p>
    </Card>
  )
}
