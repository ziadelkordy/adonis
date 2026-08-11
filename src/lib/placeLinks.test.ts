import { describe, expect, it } from 'vitest'
import type { Place } from './api'
import { lookupLinkFor, mapsUrlFor, searchUrlFor } from './placeLinks'

function place(overrides: Partial<Place> = {}): Place {
  return {
    id: 'node/1',
    name: 'El Torito',
    category: 'food',
    lat: 37.4332,
    lon: -121.8989,
    neighborhood: 'Milpitas',
    openingHours: null,
    website: null,
    phone: null,
    fee: null,
    cuisine: 'mexican',
    durationMin: 60,
    ...overrides,
  }
}

/** Reads the `q`/`query` parameter back out, decoded. */
function queryOf(url: string, param: 'q' | 'query'): string {
  return new URL(url).searchParams.get(param) ?? ''
}

describe('searchUrlFor', () => {
  it('narrows a chain name with its locality', () => {
    // "El Torito" alone reaches a national homepage or the wrong branch.
    expect(queryOf(searchUrlFor(place()), 'q')).toBe('El Torito Milpitas')
  })

  it('encodes names that would otherwise break the URL', () => {
    const url = searchUrlFor(place({ name: "Peet's Coffee & Tea", neighborhood: 'San José' }))
    // Parsing it back proves the encoding survived rather than truncating at &.
    expect(queryOf(url, 'q')).toBe("Peet's Coffee & Tea San José")
  })

  it('falls back to the name alone when no locality is recorded', () => {
    expect(queryOf(searchUrlFor(place({ neighborhood: null })), 'q')).toBe('El Torito')
  })

  it('does not repeat the name when OSM stores it as the locality too', () => {
    const url = searchUrlFor(place({ name: 'Milpitas', neighborhood: 'Milpitas' }))
    expect(queryOf(url, 'q')).toBe('Milpitas')
  })

  it('ignores a whitespace-only locality', () => {
    expect(queryOf(searchUrlFor(place({ neighborhood: '   ' })), 'q')).toBe('El Torito')
  })

  it('matches the locality case-insensitively when deduplicating', () => {
    const url = searchUrlFor(place({ name: 'Milpitas', neighborhood: 'MILPITAS' }))
    expect(queryOf(url, 'q')).toBe('Milpitas')
  })
})

describe('mapsUrlFor', () => {
  it('searches by name so the map lands on the place, not a bare pin', () => {
    const url = mapsUrlFor(place())
    expect(queryOf(url, 'query')).toBe('El Torito Milpitas')
  })

  it('carries the coordinates so an ambiguous name still resolves', () => {
    expect(new URL(mapsUrlFor(place())).searchParams.get('center')).toBe('37.4332,-121.8989')
  })

  it('keeps negative longitudes intact', () => {
    const center = new URL(mapsUrlFor(place({ lat: -33.86, lon: 151.2 }))).searchParams.get('center')
    expect(center).toBe('-33.86,151.2')
  })
})

describe('lookupLinkFor', () => {
  it('prefers a real website over any search', () => {
    const link = lookupLinkFor(place({ website: 'https://example.com' }))
    expect(link).toEqual({ href: 'https://example.com', label: 'Visit website' })
  })

  it('searches the web when a locality can narrow the name', () => {
    const link = lookupLinkFor(place())
    expect(link.label).toBe('Search the web')
    expect(queryOf(link.href, 'q')).toBe('El Torito Milpitas')
  })

  it('goes to the map when there is no locality to narrow with', () => {
    // Real case: a restaurant named "Solidarity" with no locality recorded. A
    // bare-name web search finds anything but the place; the map has coordinates.
    const link = lookupLinkFor(place({ name: 'Solidarity', neighborhood: null }))
    expect(link.label).toBe('Find on the map')
    expect(new URL(link.href).searchParams.get('center')).toBe('37.4332,-121.8989')
  })

  it('never returns an empty target', () => {
    for (const p of [place(), place({ neighborhood: null }), place({ website: 'https://x.co' })]) {
      expect(lookupLinkFor(p).href).toMatch(/^https:\/\//)
      expect(lookupLinkFor(p).label.length).toBeGreaterThan(0)
    }
  })
})
