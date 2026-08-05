import { describe, expect, it } from 'vitest'
import { describeDate, parseRoute, routeToHref, shiftDate, todayISO } from './router'

describe('parseRoute', () => {
  it('defaults unknown paths to Today rather than 404-ing', () => {
    expect(parseRoute('/nonsense', '').section).toBe('today')
    expect(parseRoute('/', '').section).toBe('today')
  })

  it('reads the explore sub-tab from the path', () => {
    expect(parseRoute('/explore/fun', '').tab).toBe('fun')
    expect(parseRoute('/explore/events', '').tab).toBe('events')
  })

  it('falls back to the nearby tab for an unrecognised one', () => {
    expect(parseRoute('/explore/wat', '').tab).toBe('nearby')
  })

  it('ignores a tab outside explore', () => {
    expect(parseRoute('/saved/fun', '').section).toBe('saved')
    expect(parseRoute('/saved/fun', '').tab).toBe('nearby')
  })

  it('rejects a malformed date instead of trusting the URL', () => {
    // The value reaches a SQL `date` column, so this must not pass through.
    expect(parseRoute('/', '?date=not-a-date').date).toBeNull()
    expect(parseRoute('/', '?date=2026-13-45').date).toBeNull()
    expect(parseRoute('/', '?date=2026-08-09').date).toBe('2026-08-09')
  })

  it('carries the detail id verbatim, slashes included', () => {
    // OSM ids look like "way/12345" — the slash must survive the round trip.
    expect(parseRoute('/explore/nearby', '?place=way%2F123').detail).toBe('way/123')
  })

  it('only treats view=map as the map', () => {
    expect(parseRoute('/explore/nearby', '?view=map').view).toBe('map')
    expect(parseRoute('/explore/nearby', '?view=nonsense').view).toBe('grid')
    expect(parseRoute('/explore/nearby', '').view).toBe('grid')
  })
})

describe('routeToHref', () => {
  it('maps today to the root path', () => {
    expect(routeToHref({ section: 'today' })).toBe('/')
  })

  it('includes the explore tab', () => {
    expect(routeToHref({ section: 'explore', tab: 'events' })).toBe('/explore/events')
  })

  it("leaves today's own date out of the URL", () => {
    expect(routeToHref({ section: 'today', date: todayISO() })).toBe('/')
  })

  it('keeps any other date', () => {
    expect(routeToHref({ section: 'today', date: '2030-01-02' })).toBe('/?date=2030-01-02')
  })

  it('encodes a detail id containing a slash', () => {
    expect(routeToHref({ section: 'explore', tab: 'nearby', detail: 'way/99' })).toBe(
      '/explore/nearby?place=way%2F99',
    )
  })

  it('round-trips through parseRoute', () => {
    const original = {
      section: 'explore' as const,
      tab: 'fun' as const,
      date: null,
      query: 'tacos',
      detail: 'node/7',
      view: 'map' as const,
    }
    const href = routeToHref(original)
    const [path, search] = href.split('?')

    expect(parseRoute(path, search ? `?${search}` : '')).toEqual(original)
  })
})

describe('shiftDate', () => {
  it('moves forward and back', () => {
    expect(shiftDate('2026-08-09', 1)).toBe('2026-08-10')
    expect(shiftDate('2026-08-09', -1)).toBe('2026-08-08')
  })

  it('crosses month and year boundaries', () => {
    expect(shiftDate('2026-08-31', 1)).toBe('2026-09-01')
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftDate('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('handles a leap day', () => {
    expect(shiftDate('2028-02-28', 1)).toBe('2028-02-29')
    expect(shiftDate('2028-02-29', 1)).toBe('2028-03-01')
  })
})

describe('describeDate', () => {
  it('names the days around today in words', () => {
    const today = todayISO()
    expect(describeDate(today)).toBe('Today')
    expect(describeDate(shiftDate(today, 1))).toBe('Tomorrow')
    expect(describeDate(shiftDate(today, -1))).toBe('Yesterday')
  })

  it('spells out anything further away', () => {
    const label = describeDate(shiftDate(todayISO(), 10))
    expect(label).not.toMatch(/Today|Tomorrow|Yesterday/)
    expect(label).toMatch(/day,/)
  })
})

describe('describeDateInline', () => {
  it('lowercases only the relative words', async () => {
    const { describeDateInline } = await import('./router')
    const today = todayISO()
    expect(describeDateInline(today)).toBe('today')
    expect(describeDateInline(shiftDate(today, 1))).toBe('tomorrow')
  })

  it('keeps capitals on a real date, so copy reads correctly mid-sentence', async () => {
    const { describeDateInline } = await import('./router')
    const label = describeDateInline(shiftDate(todayISO(), 20))
    // Lowercasing wholesale produced "thursday, august 20".
    expect(label).toMatch(/^[A-Z]/)
    expect(label).not.toBe(label.toLowerCase())
  })
})
