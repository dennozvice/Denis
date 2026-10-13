/** Schermate in costruzione (sostituite da CoverFlow.tsx, Clock.tsx, Stopwatch.tsx). */
import { t } from '../../i18n/strings'

export function PlaceholderScreen({ label }: { label: string }) {
  return (
    <div className="screen-plain">
      <div className="msg" style={{ top: 96, fontSize: 14, color: '#6e6e6e' }}>
        {label}
      </div>
    </div>
  )
}

export const CoverFlowPlaceholder = () => <PlaceholderScreen label={t('coverFlow')} />
export const ClockPlaceholder = () => <PlaceholderScreen label={t('clocks')} />
export const StopwatchPlaceholder = () => <PlaceholderScreen label={t('stopwatch')} />
