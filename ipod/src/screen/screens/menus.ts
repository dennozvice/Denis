/**
 * Definizioni di tutte le schermate-lista: menu principale, Musica, liste della libreria,
 * Extra, Impostazioni, scelte di un valore e conferme. Le etichette passano dal dizionario.
 */
import { player, playerStore } from '../../audio/player'
import type { QueueItem } from '../../audio/queue'
import { nav } from '../../core/navigation'
import { BACKLIGHT_OPTIONS, EQ_PRESETS, resetSettings, settingsStore, updateSettings, type EqPreset, type Settings } from '../../core/settings'
import { system } from '../../core/system'
import { t, type StringKey } from '../../i18n/strings'
import { library, libraryStore, relabelLibrary } from '../../library/index'
import { indexLetter } from '../../library/sort'
import { eraseLibrary, startSync, supportsFolderPicker, syncStore } from '../../library/syncFlow'
import type { Track } from '../../library/types'
import { defineList, type ListItem } from '../listModel'
import { unknownLabels } from '../../i18n/strings'

const S = () => settingsStore.get()
const L = () => libraryStore.get()

const toQueue = (tracks: readonly Track[]): QueueItem[] => tracks.map((tr) => ({ id: tr.id, albumId: tr.albumId }))

/** Parametri di navigazione con il genere aggiunto solo se presente (Record<string,string> puro). */
function withGenre(params: Record<string, string>, genre: string | undefined): Record<string, string> {
  return genre ? { ...params, genre } : params
}

function songRows(tracks: readonly Track[], queue: () => QueueItem[], withLetter = false): ListItem[] {
  const current = playerStore.get().trackId
  return tracks.map((tr) => ({
    id: tr.id,
    label: tr.title,
    playing: tr.id === current,
    letter: withLetter ? indexLetter(tr.title) : undefined,
    action: { kind: 'play', items: queue, startId: tr.id },
    otgTrackIds: [tr.id],
  }))
}

const eqKey: Record<EqPreset, StringKey> = {
  off: 'eqOff', acoustic: 'eqAcoustic', bassBooster: 'eqBassBooster', bassReducer: 'eqBassReducer', classical: 'eqClassical', dance: 'eqDance',
  deep: 'eqDeep', electronic: 'eqElectronic', flat: 'eqFlat', hipHop: 'eqHipHop', jazz: 'eqJazz', latin: 'eqLatin', loudness: 'eqLoudness',
  lounge: 'eqLounge', piano: 'eqPiano', pop: 'eqPop', rnb: 'eqRnb', rock: 'eqRock', smallSpeakers: 'eqSmallSpeakers', spokenWord: 'eqSpokenWord',
  trebleBooster: 'eqTrebleBooster', trebleReducer: 'eqTrebleReducer', vocalBooster: 'eqVocalBooster',
}

export const shuffleLabel = (v: Settings['shuffle']) => t(v === 'off' ? 'shuffleOff' : v === 'songs' ? 'shuffleSongsValue' : 'shuffleAlbums')
export const repeatLabel = (v: Settings['repeat']) => t(v === 'off' ? 'repeatOff' : v === 'one' ? 'repeatOne' : 'repeatAll')
const backlightLabel = (v: number) => (v === 0 ? t('alwaysOn') : `${v} ${t('seconds')}`)

/* ---------------- Menu principale ---------------- */
defineList('main', {
  title: () => t('ipod'),
  split: true,
  items: () => {
    const items: ListItem[] = [
      { id: 'music', label: t('music'), chevron: true, pane: 'slideshow', action: { kind: 'push', screen: 'music' } },
      { id: 'videos', label: t('videos'), chevron: true, pane: 'videos', action: { kind: 'push', screen: 'videos' } },
      { id: 'photos', label: t('photos'), chevron: true, pane: 'photos', action: { kind: 'push', screen: 'photos' } },
      { id: 'podcasts', label: t('podcasts'), chevron: true, pane: 'podcasts', action: { kind: 'push', screen: 'podcasts' } },
      { id: 'extras', label: t('extras'), chevron: true, pane: 'extras', action: { kind: 'push', screen: 'extras' } },
      { id: 'settings', label: t('settings'), chevron: true, pane: 'settings', action: { kind: 'push', screen: 'settings' } },
      {
        id: 'shuffle',
        label: t('shuffleSongs'),
        pane: 'slideshow',
        action: { kind: 'play', items: () => toQueue(L().index.songs.filter((s) => s.kind === 'music')), startId: null, shuffle: 'songs' },
      },
    ]
    if (playerStore.get().trackId) items.push({ id: 'np', label: t('nowPlaying'), chevron: true, pane: 'nowPlaying', action: { kind: 'push', screen: 'nowPlaying' } })
    return items
  },
})

/* Video e Foto: voci presenti sul vero iPod; qui aprono elenchi vuoti (niente video né foto sul web). */
const emptyRow = (id: StringKey): ListItem => ({ id, label: t(id), chevron: true, action: { kind: 'push', screen: 'empty', params: { title: t(id) } } })
defineList('videos', {
  title: () => t('videos'),
  items: () => [emptyRow('movies'), emptyRow('musicVideos'), emptyRow('tvShows'), emptyRow('videoPlaylists')],
})
defineList('photos', {
  title: () => t('photos'),
  items: () => [emptyRow('allPhotos'), emptyRow('slideshowSettings')],
})
defineList('empty', {
  title: (s) => s.params.title ?? '',
  items: () => [],
})

/* ---------------- Musica ---------------- */
defineList('music', {
  title: () => t('music'),
  split: true,
  items: () => {
    const items: ListItem[] = [
      { id: 'coverflow', label: t('coverFlow'), chevron: true, action: { kind: 'push', screen: 'coverflow' } },
      { id: 'playlists', label: t('playlists'), chevron: true, action: { kind: 'push', screen: 'playlists' } },
      { id: 'artists', label: t('artists'), chevron: true, action: { kind: 'push', screen: 'artists' } },
      { id: 'albums', label: t('albums'), chevron: true, action: { kind: 'push', screen: 'albums' } },
      { id: 'songs', label: t('songs'), chevron: true, action: { kind: 'push', screen: 'songs' } },
      { id: 'genres', label: t('genres'), chevron: true, action: { kind: 'push', screen: 'genres' } },
      { id: 'composers', label: t('composers'), chevron: true, action: { kind: 'push', screen: 'composers' } },
      { id: 'audiobooks', label: t('audiobooks'), chevron: true, action: { kind: 'push', screen: 'audiobooks' } },
      { id: 'search', label: t('search'), chevron: true, action: { kind: 'push', screen: 'search' } },
    ]
    return items.map((i) => ({ ...i, pane: 'slideshow' as const }))
  },
})

defineList('playlists', {
  title: () => t('playlists'),
  items: () => {
    const lists = L().playlists
    const user = lists.filter((p) => p.kind === 'user')
    const otg = lists.find((p) => p.kind === 'otg')
    const items: ListItem[] = user.map((p) => ({
      id: p.id,
      label: p.name,
      chevron: true,
      action: { kind: 'push', screen: 'playlist', params: { id: p.id } },
      otgTrackIds: p.trackIds,
    }))
    items.push({ id: 'otg', label: t('onTheGo'), chevron: true, action: { kind: 'push', screen: 'playlist', params: { id: 'otg' } }, otgTrackIds: otg?.trackIds ?? [] })
    return items
  },
})

defineList('playlist', {
  title: (s) => library.playlist(s.params.id ?? '')?.name ?? t(s.params.id === 'otg' ? 'onTheGo' : 'playlists'),
  items: (s) => {
    const p = library.playlist(s.params.id ?? '')
    if (!p) return []
    const tracks = library.tracksOf(p.trackIds)
    const rows = songRows(tracks, () => toQueue(tracks))
    if (p.kind === 'otg' && tracks.length > 0) {
      // Come sull'iPod: la On-The-Go si può salvare come playlist ("Nuova playlist 1", 2, …) o svuotare.
      rows.unshift(
        {
          id: '_save',
          label: t('savePlaylist'),
          action: {
            kind: 'run',
            run: () => {
              const existing = L().playlists.filter((x) => x.kind === 'user').map((x) => x.name)
              let n = 1
              while (existing.includes(`${t('newPlaylist')} ${n}`)) n++
              const id = `pl-${Date.now().toString(36)}`
              void library.savePlaylist({ id, name: `${t('newPlaylist')} ${n}`, trackIds: [...p.trackIds], kind: 'user' }).then(() => library.clearOnTheGo()).then(() => nav.pop())
            },
          },
        },
        { id: '_clear', label: t('clearPlaylist'), chevron: true, action: { kind: 'push', screen: 'confirm', params: { action: 'clearOtg' } } },
      )
    }
    return rows
  },
  empty: () => t('emptyList'),
})

/* Artisti → (Tutti | album) → brani */
defineList('artists', {
  title: () => t('artists'),
  letters: true,
  items: (s) => {
    const genre = s.params.genre
    let artists = L().index.artists
    if (genre) artists = artists.filter((a) => library.tracksOf(a.trackIds).some((tr) => tr.genre === genre))
    if (artists.length === 0) return []
    const all: ListItem = {
      id: '_all',
      label: t('all'),
      chevron: true,
      action: { kind: 'push', screen: 'albums', params: genre ? { genre } : {} },
    }
    return [
      all,
      ...artists.map((a) => ({
        id: a.name,
        label: a.name,
        chevron: true,
        letter: indexLetter(a.name),
        action: { kind: 'push' as const, screen: 'artist' as const, params: withGenre({ artist: a.name }, genre) },
        otgTrackIds: a.trackIds,
      })),
    ]
  },
})

function artistTracks(artistName: string, genre?: string): Track[] {
  const a = library.artist(artistName)
  if (!a) return []
  const out: Track[] = []
  for (const albumId of a.albumIds) {
    const album = library.album(albumId)
    if (!album) continue
    for (const tr of library.tracksOf(album.trackIds)) if (!genre || tr.genre === genre) out.push(tr)
  }
  return out
}

defineList('artist', {
  title: (s) => s.params.artist ?? '',
  items: (s) => {
    const a = library.artist(s.params.artist ?? '')
    if (!a) return []
    const genre = s.params.genre
    const albums = a.albumIds.map((id) => library.album(id)).filter((al): al is NonNullable<typeof al> => !!al)
    const filtered = genre ? albums.filter((al) => library.tracksOf(al.trackIds).some((tr) => tr.genre === genre)) : albums
    if (filtered.length === 1) {
      // Un solo album: l'iPod mostra direttamente i brani.
      const tracks = library.tracksOf(filtered[0]!.trackIds).filter((tr) => !genre || tr.genre === genre)
      return songRows(tracks, () => toQueue(tracks))
    }
    const items: ListItem[] = [
      { id: '_all', label: t('all'), chevron: true, action: { kind: 'push', screen: 'songs', params: withGenre({ artist: a.name }, genre) }, otgTrackIds: a.trackIds },
    ]
    for (const al of filtered) {
      items.push({
        id: al.id,
        label: al.title,
        chevron: true,
        action: { kind: 'push', screen: 'album', params: withGenre({ id: al.id }, genre) },
        otgTrackIds: al.trackIds,
      })
    }
    return items
  },
})

defineList('albums', {
  title: () => t('albums'),
  letters: true,
  items: (s) => {
    const genre = s.params.genre
    let albums = L().index.albums
    if (genre) albums = albums.filter((al) => library.tracksOf(al.trackIds).some((tr) => tr.genre === genre))
    if (albums.length === 0) return []
    const all: ListItem = { id: '_all', label: t('all'), chevron: true, action: { kind: 'push', screen: 'songs', params: genre ? { genre } : {} } }
    return [
      all,
      ...albums.map((al) => ({
        id: al.id,
        label: al.title,
        chevron: true,
        letter: indexLetter(al.title),
        action: { kind: 'push' as const, screen: 'album' as const, params: withGenre({ id: al.id }, genre) },
        otgTrackIds: al.trackIds,
      })),
    ]
  },
})

defineList('album', {
  title: (s) => library.album(s.params.id ?? '')?.title ?? t('albums'),
  items: (s) => {
    const al = library.album(s.params.id ?? '')
    if (!al) return []
    const genre = s.params.genre
    const tracks = library.tracksOf(al.trackIds).filter((tr) => !genre || tr.genre === genre)
    return songRows(tracks, () => toQueue(tracks))
  },
})

defineList('songs', {
  title: (s) => (s.params.artist ? s.params.artist : s.params.genre && !s.params.artist ? s.params.genre : t('songs')),
  letters: true,
  items: (s) => {
    const { artist, genre, composer } = s.params
    let tracks: Track[]
    if (artist) tracks = artistTracks(artist, genre)
    else {
      tracks = L().index.songs.filter((tr) => tr.kind === 'music')
      if (genre) tracks = tracks.filter((tr) => tr.genre === genre)
      if (composer) tracks = tracks.filter((tr) => tr.composer === composer)
    }
    return songRows(tracks, () => toQueue(tracks), !artist)
  },
})

defineList('genres', {
  title: () => t('genres'),
  letters: true,
  items: () =>
    L().index.genres.map((g) => ({
      id: g.name,
      label: g.name,
      chevron: true,
      letter: indexLetter(g.name),
      action: { kind: 'push' as const, screen: 'artists' as const, params: { genre: g.name } },
      otgTrackIds: g.trackIds,
    })),
})

defineList('composers', {
  title: () => t('composers'),
  letters: true,
  items: () =>
    L().index.composers.map((c) => ({
      id: c.name,
      label: c.name,
      chevron: true,
      letter: indexLetter(c.name),
      action: { kind: 'push' as const, screen: 'songs' as const, params: { composer: c.name } },
      otgTrackIds: c.trackIds,
    })),
})

defineList('podcasts', {
  title: () => t('podcasts'),
  items: () => {
    const tracks = library.byKind('podcast')
    return songRows(tracks, () => toQueue(tracks))
  },
  empty: () => t('noPodcasts'),
})

defineList('audiobooks', {
  title: () => t('audiobooks'),
  items: () => {
    const tracks = library.byKind('audiobook')
    return songRows(tracks, () => toQueue(tracks))
  },
  empty: () => t('noAudiobooks'),
})

/* ---------------- Extra ---------------- */
defineList('extras', {
  title: () => t('extras'),
  items: () => [
    { id: 'clocks', label: t('clocks'), chevron: true, action: { kind: 'push', screen: 'clock' } },
    { id: 'games', label: t('games'), chevron: true, action: { kind: 'push', screen: 'games' } },
    { id: 'stopwatch', label: t('stopwatch'), chevron: true, action: { kind: 'push', screen: 'stopwatch' } },
  ],
})

defineList('games', {
  title: () => t('games'),
  items: () => [],
  empty: () => t('gamesSoon'),
})

/* ---------------- Impostazioni ---------------- */
function cycle<T>(list: readonly T[], current: T): T {
  const i = list.indexOf(current)
  return list[(i + 1) % list.length]!
}

defineList('settings', {
  title: () => t('settings'),
  items: () => {
    const s = S()
    const items: ListItem[] = [
      { id: 'about', label: t('about'), chevron: true, action: { kind: 'push', screen: 'about' } },
      { id: 'sync', label: t('syncMusic'), chevron: true, action: { kind: 'run', run: () => void startSync('files') } },
    ]
    if (supportsFolderPicker()) items.push({ id: 'syncFolder', label: t('syncFolder'), chevron: true, action: { kind: 'run', run: () => void startSync('picker') } })
    else items.push({ id: 'syncFolder', label: t('syncFolder'), chevron: true, action: { kind: 'run', run: () => void startSync('folder') } })
    if (syncStore.get().folderName) items.push({ id: 'resync', label: t('resync'), value: syncStore.get().folderName ?? '', action: { kind: 'run', run: () => void startSync('resync') } })
    items.push(
      { id: 'demo', label: t('demoTracks'), chevron: true, action: { kind: 'run', run: () => void startSync('demo') } },
      {
        id: 'shuffle',
        label: t('shuffle'),
        value: shuffleLabel(s.shuffle),
        action: {
          kind: 'run',
          run: () => {
            const v = cycle(['off', 'songs', 'albums'] as const, S().shuffle)
            updateSettings({ shuffle: v })
            player.setShuffle(v)
          },
        },
      },
      {
        id: 'repeat',
        label: t('repeat'),
        value: repeatLabel(s.repeat),
        action: {
          kind: 'run',
          run: () => {
            const v = cycle(['off', 'one', 'all'] as const, S().repeat)
            updateSettings({ repeat: v })
            player.setRepeat(v)
          },
        },
      },
      { id: 'eq', label: t('eq'), value: t(eqKey[s.eq]), chevron: true, action: { kind: 'push', screen: 'option', params: { setting: 'eq' } } },
      { id: 'backlight', label: t('backlight'), chevron: true, action: { kind: 'push', screen: 'option', params: { setting: 'backlight' } } },
      { id: 'brightness', label: t('brightness'), chevron: true, action: { kind: 'push', screen: 'brightness' } },
      { id: 'clicker', label: t('clicker'), value: t(s.clicker ? 'on' : 'off'), action: { kind: 'run', run: () => updateSettings({ clicker: !S().clicker }) } },
      { id: 'timeFormat', label: t('timeFormat'), value: t(s.clock24h ? 'h24' : 'h12'), action: { kind: 'run', run: () => updateSettings({ clock24h: !S().clock24h }) } },
      { id: 'language', label: t('language'), chevron: true, action: { kind: 'push', screen: 'option', params: { setting: 'language' } } },
      { id: 'color', label: t('color'), value: t(s.color === 'silver' ? 'silver' : 'black'), chevron: true, action: { kind: 'push', screen: 'option', params: { setting: 'color' } } },
      { id: 'legal', label: t('legal'), chevron: true, action: { kind: 'push', screen: 'legal' } },
      { id: 'erase', label: t('eraseMusic'), chevron: true, action: { kind: 'push', screen: 'confirm', params: { action: 'erase' } } },
      { id: 'reset', label: t('resetSettings'), chevron: true, action: { kind: 'push', screen: 'confirm', params: { action: 'reset' } } },
    )
    return items
  },
})

const optionTitles: Record<string, StringKey> = { eq: 'eq', backlight: 'backlight', language: 'language', color: 'color' }

defineList('option', {
  title: (s) => t(optionTitles[s.params.setting ?? ''] ?? 'settings'),
  items: (s) => {
    const setting = s.params.setting
    const st = S()
    switch (setting) {
      case 'eq':
        return EQ_PRESETS.map((p) => ({
          id: p,
          label: t(eqKey[p]),
          checked: st.eq === p,
          action: {
            kind: 'run' as const,
            run: () => {
              updateSettings({ eq: p })
              player.setEq(p)
            },
          },
        }))
      case 'backlight':
        return BACKLIGHT_OPTIONS.map((v) => ({
          id: String(v),
          label: backlightLabel(v),
          checked: st.backlightSeconds === v,
          action: { kind: 'run' as const, run: () => updateSettings({ backlightSeconds: v }) },
        }))
      case 'language':
        return (['en', 'it'] as const).map((l) => ({
          id: l,
          label: t(l === 'it' ? 'italian' : 'english'),
          checked: st.language === l,
          action: {
            kind: 'run' as const,
            run: () => {
              updateSettings({ language: l, welcomed: true })
              relabelLibrary(unknownLabels(l))
              // Prima accensione (o dopo un ripristino): scelta la lingua si va al menu principale.
              if (s.params.first === '1') nav.home()
            },
          },
        }))
      case 'color':
        return (['silver', 'black'] as const).map((c) => ({
          id: c,
          label: t(c),
          checked: st.color === c,
          action: { kind: 'run' as const, run: () => updateSettings({ color: c }) },
        }))
      default:
        return []
    }
  },
})

defineList('confirm', {
  title: (s) => t(s.params.action === 'erase' ? 'eraseMusic' : s.params.action === 'clearOtg' ? 'onTheGo' : 'resetSettings'),
  items: (s) => {
    const action = s.params.action
    const cancel: ListItem = { id: 'cancel', label: t('cancel'), action: { kind: 'run', run: () => nav.pop() } }
    if (action === 'erase') {
      return [
        cancel,
        {
          id: 'erase',
          label: t('erase'),
          action: {
            kind: 'run',
            run: () => {
              player.stop()
              void eraseLibrary().then(() => nav.home())
            },
          },
        },
      ]
    }
    if (action === 'clearOtg') {
      return [cancel, { id: 'clear', label: t('clearPlaylist'), action: { kind: 'run', run: () => void library.clearOnTheGo().then(() => nav.pop()) } }]
    }
    return [
      cancel,
      {
        id: 'reset',
        label: t('reset'),
        action: {
          kind: 'run',
          run: () => {
            resetSettings()
            const st = S()
            player.setShuffle(st.shuffle)
            player.setRepeat(st.repeat)
            player.setEq(st.eq)
            player.setVolume(st.volume)
            relabelLibrary(unknownLabels(st.language))
            system.touch()
            // Come sul vero iPod, dopo il ripristino compare la scelta della lingua.
            nav.home()
            nav.push('option', { setting: 'language', first: '1' })
          },
        },
      },
    ]
  },
})
