import { describe, expect, it } from 'vitest'
import { parseEventSnapshot } from './schedule.ts'

/*
 * This payload comes from the client, so the point of these tests is that bad
 * input is rejected or clamped rather than reaching Postgres.
 */
const valid = {
  id: 'espn:football/nfl:401',
  source: 'espn',
  name: 'Rams at Chargers',
  date: '2026-08-22',
  startMinutes: 1020,
  venueName: 'SoFi Stadium',
  city: 'Inglewood',
  lat: 33.9535,
  lon: -118.3392,
  segment: 'Sports',
  genre: 'American Football',
  priceMin: 89,
  priceMax: 410,
  currency: 'USD',
  imageUrl: null,
  url: 'https://example.com/e/401',
  durationMin: 180,
}

describe('parseEventSnapshot', () => {
  it('accepts a well-formed snapshot unchanged', () => {
    expect(parseEventSnapshot(valid)).toMatchObject({
      id: valid.id,
      name: valid.name,
      date: valid.date,
      startMinutes: 1020,
      durationMin: 180,
    })
  })

  it('rejects anything that is not an object', () => {
    for (const input of [null, undefined, 'x', 42, []]) {
      expect(parseEventSnapshot(input)).toBeNull()
    }
  })

  it('requires id, name, url and date', () => {
    for (const field of ['id', 'name', 'url', 'date'] as const) {
      expect(parseEventSnapshot({ ...valid, [field]: undefined })).toBeNull()
      expect(parseEventSnapshot({ ...valid, [field]: '   ' })).toBeNull()
    }
  })

  it('rejects a date that is not YYYY-MM-DD', () => {
    // It lands in a SQL `date` column, so the format has to be exact.
    expect(parseEventSnapshot({ ...valid, date: '22/08/2026' })).toBeNull()
    expect(parseEventSnapshot({ ...valid, date: '2026-8-1' })).toBeNull()
  })

  it('nulls a start time outside the day instead of storing it', () => {
    // The column has a 0..1439 check constraint; this must not reach it.
    expect(parseEventSnapshot({ ...valid, startMinutes: 1440 })?.startMinutes).toBeNull()
    expect(parseEventSnapshot({ ...valid, startMinutes: -5 })?.startMinutes).toBeNull()
    expect(parseEventSnapshot({ ...valid, startMinutes: 'noon' })?.startMinutes).toBeNull()
  })

  it('keeps a missing start time as null rather than guessing', () => {
    expect(parseEventSnapshot({ ...valid, startMinutes: null })?.startMinutes).toBeNull()
  })

  it('falls back to a default duration when the value is absurd', () => {
    expect(parseEventSnapshot({ ...valid, durationMin: 0 })?.durationMin).toBe(150)
    expect(parseEventSnapshot({ ...valid, durationMin: 99_999 })?.durationMin).toBe(150)
    expect(parseEventSnapshot({ ...valid, durationMin: undefined })?.durationMin).toBe(150)
  })

  it('truncates oversized strings', () => {
    const parsed = parseEventSnapshot({ ...valid, name: 'x'.repeat(5000) })
    expect(parsed?.name.length).toBe(300)
  })

  it('drops non-numeric coordinates rather than passing NaN to the database', () => {
    const parsed = parseEventSnapshot({ ...valid, lat: 'north', lon: Number.NaN })
    expect(parsed?.lat).toBeNull()
    expect(parsed?.lon).toBeNull()
  })

  it('defaults an unknown source instead of rejecting the event', () => {
    expect(parseEventSnapshot({ ...valid, source: undefined })?.source).toBe('unknown')
  })
})
