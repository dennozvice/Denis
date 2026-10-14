/** Copertina di un album: immagine o segnaposto con le crome; riflesso opzionale. */
import { useArtwork } from '../library/useArtwork'
import { NoteIcon } from './icons'

export function Artwork({
  artworkId,
  size,
  reflection = 0,
  full = false,
  className = '',
  style,
}: {
  artworkId: string | null | undefined
  size: number
  /** Altezza del riflesso in px (0 = nessuno). */
  reflection?: number
  full?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  const url = useArtwork(artworkId, full ? 'full' : 'thumb')
  const inner = url ? (
    <img src={url} alt="" draggable={false} decoding="async" />
  ) : (
    <div className="art-note">
      <NoteIcon />
    </div>
  )
  return (
    <div className={`art ${className}`} style={{ width: size, height: size, ...style }}>
      {inner}
      {reflection > 0 && (
        <div className="art-reflection" style={{ height: reflection }}>
          <div className="art" style={{ width: size, height: size }}>
            {inner}
          </div>
        </div>
      )}
    </div>
  )
}
