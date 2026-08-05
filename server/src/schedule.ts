import { sql } from './db.ts'

/*
 * A scheduled item points at either a place or an event, never both. Events come
 * from live providers, so a snapshot is stored when one is scheduled — a plan
 * shouldn't fall apart because a provider stopped listing the fixture.
 */

export interface EventSnapshot {
  id: string
  source: string
  name: string
  date: string
  startMinutes: number | null
  venueName: string | null
  city: string | null
  lat: number | null
  lon: number | null
  segment: string | null
  genre: string | null
  priceMin: number | null
  priceMax: number | null
  currency: string | null
  imageUrl: string | null
  url: string
  durationMin: number
}

/** Guards against oversized strings reaching the database. */
function clamp(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : null
}

function numberOrNull(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value
}

/**
 * Validates a client-supplied event snapshot.
 *
 * The client sends this rather than the server re-querying, because the provider
 * result the user clicked may already have aged out of the short-lived events
 * cache. It's the user's own plan, so the risk is low, but every field is still
 * checked and bounded rather than trusted.
 */
export function parseEventSnapshot(input: unknown): EventSnapshot | null {
  if (typeof input !== 'object' || input === null) return null
  const raw = input as Record<string, unknown>

  const id = clamp(raw.id, 200)
  const name = clamp(raw.name, 300)
  const url = clamp(raw.url, 1000)
  const date = clamp(raw.date, 10)

  if (!id || !name || !url || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null

  const startMinutes = numberOrNull(raw.startMinutes)
  const durationMin = numberOrNull(raw.durationMin)

  return {
    id,
    source: clamp(raw.source, 40) ?? 'unknown',
    name,
    date,
    startMinutes:
      startMinutes !== null && startMinutes >= 0 && startMinutes < 1440
        ? Math.round(startMinutes)
        : null,
    venueName: clamp(raw.venueName, 300),
    city: clamp(raw.city, 200),
    lat: numberOrNull(raw.lat),
    lon: numberOrNull(raw.lon),
    segment: clamp(raw.segment, 100),
    genre: clamp(raw.genre, 100),
    priceMin: numberOrNull(raw.priceMin),
    priceMax: numberOrNull(raw.priceMax),
    currency: clamp(raw.currency, 10),
    imageUrl: clamp(raw.imageUrl, 1000),
    url,
    durationMin:
      durationMin !== null && durationMin >= 15 && durationMin <= 720
        ? Math.round(durationMin)
        : 150,
  }
}

export async function upsertEvent(event: EventSnapshot): Promise<void> {
  await sql`
    INSERT INTO events (
      id, source, name, starts_on, starts_at_min, venue_name, city, lat, lon,
      segment, genre, price_min, price_max, currency, image_url, url, duration_min
    ) VALUES (
      ${event.id}, ${event.source}, ${event.name}, ${event.date}, ${event.startMinutes},
      ${event.venueName}, ${event.city}, ${event.lat}, ${event.lon}, ${event.segment},
      ${event.genre}, ${event.priceMin}, ${event.priceMax}, ${event.currency},
      ${event.imageUrl}, ${event.url}, ${event.durationMin}
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      starts_on = EXCLUDED.starts_on,
      starts_at_min = EXCLUDED.starts_at_min,
      venue_name = EXCLUDED.venue_name,
      city = EXCLUDED.city,
      lat = EXCLUDED.lat,
      lon = EXCLUDED.lon,
      price_min = EXCLUDED.price_min,
      price_max = EXCLUDED.price_max,
      image_url = EXCLUDED.image_url,
      url = EXCLUDED.url,
      cached_at = now()
  `
}

/** Event snapshots by id, for rendering scheduled or saved events. */
export async function loadEvents(ids: string[]): Promise<EventSnapshot[]> {
  if (ids.length === 0) return []

  const rows = await sql<
    Array<{
      id: string
      source: string
      name: string
      starts_on: Date | string
      starts_at_min: number | null
      venue_name: string | null
      city: string | null
      lat: number | null
      lon: number | null
      segment: string | null
      genre: string | null
      price_min: string | null
      price_max: string | null
      currency: string | null
      image_url: string | null
      url: string
      duration_min: number
    }>
  >`
    SELECT id, source, name, starts_on, starts_at_min, venue_name, city, lat, lon,
           segment, genre, price_min, price_max, currency, image_url, url, duration_min
    FROM events
    WHERE id = ANY(${ids})
  `

  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    name: row.name,
    // `date` columns come back as Date objects; the API speaks YYYY-MM-DD.
    date:
      typeof row.starts_on === 'string'
        ? row.starts_on.slice(0, 10)
        : row.starts_on.toISOString().slice(0, 10),
    startMinutes: row.starts_at_min,
    venueName: row.venue_name,
    city: row.city,
    lat: row.lat === null ? null : Number(row.lat),
    lon: row.lon === null ? null : Number(row.lon),
    segment: row.segment,
    genre: row.genre,
    // numeric arrives as a string from postgres.js to avoid precision loss.
    priceMin: row.price_min === null ? null : Number(row.price_min),
    priceMax: row.price_max === null ? null : Number(row.price_max),
    currency: row.currency,
    imageUrl: row.image_url,
    url: row.url,
    durationMin: row.duration_min,
  }))
}
