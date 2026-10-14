import { beforeEach, describe, expect, it } from 'vitest'
import { nav, navStore } from './navigation'

describe('navigation stack', () => {
  beforeEach(() => nav.reset())

  it('parte dal menu principale e non torna oltre la radice', () => {
    expect(nav.top().kind).toBe('main')
    expect(nav.pop()).toBe(false)
    expect(nav.depth()).toBe(1)
  })
  it('push/pop conservano la selezione delle schermate precedenti', () => {
    nav.update({ sel: 2 })
    nav.push('music')
    nav.update({ sel: 3, first: 1 })
    nav.push('artists')
    expect(nav.depth()).toBe(3)
    expect(nav.pop()).toBe(true)
    expect(nav.top()).toMatchObject({ kind: 'music', sel: 3, first: 1 })
    nav.pop()
    expect(nav.top()).toMatchObject({ kind: 'main', sel: 2 })
  })
  it('home torna alla radice, replace sostituisce la cima, removeKind toglie un tipo', () => {
    nav.push('music')
    nav.push('nowPlaying')
    nav.replace('coverflow')
    expect(nav.top().kind).toBe('coverflow')
    nav.push('nowPlaying')
    nav.removeKind('nowPlaying')
    expect(navStore.get().stack.map((s) => s.kind)).toEqual(['main', 'music', 'coverflow'])
    nav.home()
    expect(nav.depth()).toBe(1)
  })
  it('update non crea un nuovo stato se non cambia nulla', () => {
    const before = navStore.get()
    nav.update({ sel: 0 })
    expect(navStore.get()).toBe(before)
  })
})
