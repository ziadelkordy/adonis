import { sql } from './db.ts'
import { geocodePlace } from './places.ts'

/*
 * Sports fixtures name a venue and city but carry no coordinates, and Nominatim
 * allows one request per second — so geocoding every venue on every request is
 * out of the question. Each venue is geocoded once and stored; failures are
 * stored too, so an unmappable venue isn't retried forever.
 */

export interface VenueLocation {
  lat: number
  lon: number
}

export interface VenueKeyParts {
  name: string
  city: string | null
  region: string | null
}

export function venueKey(name: string, city: string | null): string {
  return `${name.trim().toLowerCase()}|${(city ?? '').trim().toLowerCase()}`
}

/** Cached coordinates for the given venues, keyed by `venueKey`. */
export async function loadVenueCache(
  keys: string[],
): Promise<Map<string, VenueLocation | null>> {
  const found = new Map<string, VenueLocation | null>()
  if (keys.length === 0) return found

  const rows = await sql<
    Array<{ cache_key: string; lat: number | null; lon: number | null; not_found: boolean }>
  >`
    SELECT cache_key, lat, lon, not_found
    FROM event_venues
    WHERE cache_key = ANY(${keys})
  `

  for (const row of rows) {
    // A null entry records "we tried and failed", which is different from "unseen".
    found.set(
      row.cache_key,
      row.not_found || row.lat === null || row.lon === null
        ? null
        : { lat: Number(row.lat), lon: Number(row.lon) },
    )
  }

  return found
}

async function remember(
  parts: VenueKeyParts,
  location: VenueLocation | null,
): Promise<void> {
  const key = venueKey(parts.name, parts.city)

  await sql`
    INSERT INTO event_venues (cache_key, name, city, region, lat, lon, not_found)
    VALUES (
      ${key}, ${parts.name}, ${parts.city}, ${parts.region},
      ${location?.lat ?? null}, ${location?.lon ?? null}, ${location === null}
    )
    ON CONFLICT (cache_key) DO UPDATE SET
      lat = EXCLUDED.lat,
      lon = EXCLUDED.lon,
      not_found = EXCLUDED.not_found,
      geocoded_at = now()
  `
}

async function geocodeOne(venue: VenueKeyParts): Promise<VenueLocation | null> {
  // "SoFi Stadium, Inglewood" beats the bare name — stadium names repeat.
  const query = [venue.name, venue.city, venue.region].filter(Boolean).join(', ')

  let location: VenueLocation | null = null
  try {
    location = await geocodePlace(query)
  } catch {
    location = null
  }

  await remember(venue, location)
  return location
}

/* -------------------------------------------------------------------------- */
/* Background warmer                                                           */
/* -------------------------------------------------------------------------- */

/*
 * Geocoding never happens on the request path.
 *
 * There are hundreds of venues across the leagues and a fortnight of fixtures,
 * and at Nominatim's one-per-second limit, geocoding even a handful per request
 * added ~9 seconds to every single call — while still mostly resolving stadiums
 * nowhere near the user. So requests read the cache only, and unresolved venues
 * are queued for a worker that drains at a polite one per second in the
 * background. The result set fills in over the following minute or two instead of
 * making anyone wait.
 */
const queue = new Map<string, VenueKeyParts>()
const queued = new Set<string>()
let draining = false

export function queueVenues(venues: VenueKeyParts[]): void {
  for (const venue of venues) {
    const key = venueKey(venue.name, venue.city)
    // `queued` is never cleared, so a venue is only ever attempted once per boot.
    if (queued.has(key)) continue
    queued.add(key)
    queue.set(key, venue)
  }
  void drain()
}

export function pendingVenueCount(): number {
  return queue.size
}

async function drain(): Promise<void> {
  if (draining) return
  draining = true

  try {
    while (queue.size > 0) {
      const [key, venue] = queue.entries().next().value as [string, VenueKeyParts]
      queue.delete(key)
      await geocodeOne(venue)
    }
  } catch (error) {
    console.error('venue warmer stopped:', error)
  } finally {
    draining = false
  }
}
