/** Hook: URL della copertina (miniatura o intera) di un album, o null se manca o non è ancora caricata. */
import { useEffect, useState } from 'react'
import { artworkUrl } from './index'

export function useArtwork(artworkId: string | null | undefined, size: 'thumb' | 'full' = 'thumb'): string | null {
  const [state, setState] = useState<{ key: string; url: string | null }>({ key: '', url: null })
  useEffect(() => {
    if (!artworkId) return
    let alive = true
    void artworkUrl(artworkId, size).then((u) => {
      if (alive) setState({ key: `${artworkId}|${size}`, url: u })
    })
    return () => {
      alive = false
    }
  }, [artworkId, size])
  return artworkId && state.key === `${artworkId}|${size}` ? state.url : null
}
