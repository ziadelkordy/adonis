import { fetchFixtures } from './espn.ts'
import { haversineKm } from './places.ts'
import { loadVenueCache, pendingVenueCount, queueVenues, venueKey } from './venues.ts'

/*
 * OpenStreetMap has no events — it maps physical geography, not things happening
 * at a time — so events need a separate provider. Ticketmaster's Discovery API is
 * the only good free, self-serve option: no credit card, 5000 calls/day.
 *
 * Without a key the endpoint reports that clearly rather than inventing listings.
 * Get one at https://developer-acct.ticketmaster.com/user/register
 */
/** Overridable so the whole path can be exercised against a local fixture. */
const TICKETMASTER_URL =
  process.env.TICKETMASTER_URL ?? 'https://app.ticketmaster.com/discovery/v2/events.json'

export function isEventsConfigured(): boolean {
  return Boolean(process.env.TICKETMASTER_API_KEY?.trim())
}

export interface EventItem {
  id: string
  /** Which provider supplied this, so the UI can attribute it. */
  source: 'ticketmaster' | 'espn'
  name: string
  /** ISO date, e.g. "2026-08-09". Always present. */
  date: string
  /** Local "HH:MM", or null when the listing has no announced time. */
  time: string | null
  venueName: string | null
  city: string | null
  lat: number | null
  lon: number | null
  distanceKm: number | null
  /** Ticketmaster "segment", e.g. Music / Sports / Arts & Theatre. */
  segment: string | null
  genre: string | null
  priceMin: number | null
  priceMax: number | null
  currency: string | null
  imageUrl: string | null
  url: string
}

export class EventsNotConfiguredError extends Error {}
export class EventsUpstreamError extends Error {}

/* -------------------------------------------------------------------------- */
/* Response shapes — narrowed defensively, since this is a third-party payload  */
/* -------------------------------------------------------------------------- */

interface RawEvent {
  id?: unknown
  name?: unknown
  url?: unknown
  dates?: { start?: { localDate?: unknown; localTime?: unknown } }
  classifications?: Array<{
    segment?: { name?: unknown }
    genre?: { name?: unknown }
  }>
  priceRanges?: Array<{ min?: unknown; max?: unknown; currency?: unknown }>
  images?: Array<{ url?: unknown; width?: unknown; ratio?: unknown }>
  _embedded?: {
    venues?: Array<{
      name?: unknown
      city?: { name?: unknown }
      location?: { latitude?: unknown; longitude?: unknown }
    }>
  }
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return null
}

/** Prefers a wide 16:9 image, which suits the card layout. */
function pickImage(images: RawEvent['images']): string | null {
  if (!Array.isArray(images) || images.length === 0) return null

  const usable = images
    .map((image) => ({ url: str(image?.url), width: num(image?.width) ?? 0, ratio: str(image?.ratio) }))
    .filter((image): image is { url: string; width: number; ratio: string | null } =>
      Boolean(image.url),
    )

  if (usable.length === 0) return null

  const wide = usable.filter((image) => image.ratio === '16_9')
  const pool = wide.length > 0 ? wide : usable
  // Widest under 1200px: big enough to look sharp, small enough not to be wasteful.
  const sorted = [...pool].sort((a, b) => b.width - a.width)
  return (sorted.find((image) => image.width <= 1200) ?? sorted[0]).url
}

function normalize(raw: RawEvent, lat: number, lon: number): EventItem | null {
  const id = str(raw.id)
  const name = str(raw.name)
  const url = str(raw.url)
  const date = str(raw.dates?.start?.localDate)

  // Without these there is nothing worth showing.
  if (!id || !name || !url || !date) return null

  const venue = raw._embedded?.venues?.[0]
  const venueLat = num(venue?.location?.latitude)
  const venueLon = num(venue?.location?.longitude)
  const classification = raw.classifications?.[0]
  const price = raw.priceRanges?.[0]

  const localTime = str(raw.dates?.start?.localTime)

  return {
    id,
    source: 'ticketmaster',
    name,
    date,
    // Ticketmaster sends "HH:MM:SS"; the seconds are never useful here.
    time: localTime ? localTime.slice(0, 5) : null,
    venueName: str(venue?.name),
    city: str(venue?.city?.name),
    lat: venueLat,
    lon: venueLon,
    distanceKm:
      venueLat !== null && venueLon !== null ? haversineKm(lat, lon, venueLat, venueLon) : null,
    segment: str(classification?.segment?.name),
    genre: str(classification?.genre?.name),
    priceMin: num(price?.min),
    priceMax: num(price?.max),
    currency: str(price?.currency),
    imageUrl: pickImage(raw.images),
    url,
  }
}

/* -------------------------------------------------------------------------- */
/* Cache — in-memory and short-lived, because listings change through the day   */
/* -------------------------------------------------------------------------- */

const CACHE_TTL_MS = 10 * 60 * 1000
const cache = new Map<string, { at: number; events: EventItem[] }>()

function cacheKey(lat: number, lon: number, radiusM: number): string {
  return `${lat.toFixed(2)}:${lon.toFixed(2)}:${radiusM}`
}

export interface EventsResult {
  events: EventItem[]
  cached: boolean
}

/* -------------------------------------------------------------------------- */
/* Sports fixtures (keyless)                                                   */
/* -------------------------------------------------------------------------- */

/** Sports fixtures within the radius, using only already-geocoded venues. */
async function sportsNearby(lat: number, lon: number, radiusM: number): Promise<EventItem[]> {
  const fixtures = (await fetchFixtures()).filter((fixture) => fixture.venueName)

  const parts = new Map<string, { name: string; city: string | null; region: string | null }>()
  for (const fixture of fixtures) {
    const name = fixture.venueName
    if (!name) continue
    parts.set(venueKey(name, fixture.city), {
      name,
      city: fixture.city,
      region: fixture.region,
    })
  }

  const coords = await loadVenueCache([...parts.keys()])

  /*
   * Anything not yet geocoded goes to the background warmer, ordered so venues in
   * the user's own state are resolved first — without coordinates, matching the
   * region is the only signal available for "might plausibly be in range".
   */
  const userRegion = await regionFor(lat, lon)
  const unseen = [...parts.entries()]
    .filter(([key]) => !coords.has(key))
    .map(([, value]) => value)
    .sort((a, b) => {
      const aLocal = userRegion && a.region === userRegion ? 0 : 1
      const bLocal = userRegion && b.region === userRegion ? 0 : 1
      return aLocal - bLocal
    })

  queueVenues(unseen)

  const items: EventItem[] = []

  for (const fixture of fixtures) {
    const name = fixture.venueName
    if (!name) continue

    const location = coords.get(venueKey(name, fixture.city))
    if (!location) continue

    const distanceKm = haversineKm(lat, lon, location.lat, location.lon)
    if (distanceKm * 1000 > radiusM) continue

    const start = new Date(fixture.startsAt)

    items.push({
      id: fixture.id,
      source: 'espn',
      // Local calendar date and time, which is what a listing should show.
      date: localDate(start),
      time: localTime(start),
      name: fixture.name,
      venueName: name,
      city: fixture.city,
      lat: location.lat,
      lon: location.lon,
      distanceKm,
      segment: fixture.segment,
      genre: fixture.genre,
      // Sports schedules carry no pricing; inventing a number would be worse.
      priceMin: null,
      priceMax: null,
      currency: null,
      imageUrl: null,
      url: fixture.url ?? 'https://www.espn.com/',
    })
  }

  return items
}

/** The server's own timezone stands in for the user's — good enough for a date. */
function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

function localTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

const regionCache = new Map<string, string | null>()

/** State/region name for the user's coordinates, cached per ~11km bucket. */
async function regionFor(lat: number, lon: number): Promise<string | null> {
  const key = `${lat.toFixed(1)}:${lon.toFixed(1)}`
  const hit = regionCache.get(key)
  if (hit !== undefined) return hit

  try {
    const { reverseGeocode } = await import('./places.ts')
    const place = await reverseGeocode(lat, lon)
    const region = place?.region ?? null
    regionCache.set(key, region)
    return region
  } catch {
    regionCache.set(key, null)
    return null
  }
}

/* -------------------------------------------------------------------------- */
/* Ticketmaster                                                                */
/* -------------------------------------------------------------------------- */

async function ticketmasterNearby(
  lat: number,
  lon: number,
  radiusM: number,
): Promise<EventItem[]> {
  const apiKey = process.env.TICKETMASTER_API_KEY?.trim()
  if (!apiKey) throw new EventsNotConfiguredError('No ticketing provider configured.')

  const key = cacheKey(lat, lon, radiusM)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.events

  const params = new URLSearchParams({
    apikey: apiKey,
    latlong: `${lat.toFixed(4)},${lon.toFixed(4)}`,
    // Ticketmaster wants a unit, and takes whole numbers only.
    radius: String(Math.max(1, Math.round(radiusM / 1000))),
    unit: 'km',
    size: '100',
    sort: 'date,asc',
  })

  let response: Response
  try {
    response = await fetch(`${TICKETMASTER_URL}?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    throw new EventsUpstreamError('Could not reach the events provider.')
  }

  if (response.status === 401) {
    throw new EventsNotConfiguredError('The events API key was rejected.')
  }
  if (!response.ok) {
    throw new EventsUpstreamError(`The events provider returned ${response.status}.`)
  }

  let payload: { _embedded?: { events?: RawEvent[] } }
  try {
    payload = (await response.json()) as typeof payload
  } catch {
    throw new EventsUpstreamError('The events provider returned malformed data.')
  }

  // No `_embedded` at all is how Ticketmaster reports "no results", not an error.
  const raw = payload._embedded?.events ?? []
  const events = raw
    .map((item) => normalize(item, lat, lon))
    .filter((item): item is EventItem => item !== null)
    .sort((a, b) => {
      const byDate = `${a.date}${a.time ?? ''}`.localeCompare(`${b.date}${b.time ?? ''}`)
      return byDate !== 0 ? byDate : a.name.localeCompare(b.name)
    })

  cache.set(key, { at: Date.now(), events })
  return events
}

/* -------------------------------------------------------------------------- */
/* Aggregate                                                                   */
/* -------------------------------------------------------------------------- */

export interface EventsBundle {
  events: EventItem[]
  /** Which providers actually contributed, so the UI can attribute and explain. */
  sources: { espn: boolean; ticketmaster: boolean }
  /** True when a ticketing key would add comedy, music and theatre listings. */
  ticketingConfigured: boolean
  /** Venues still queued for geocoding; more events may appear shortly. */
  venuesPending: number
}

/**
 * Sports come from ESPN and need no key; comedy, music and theatre need a
 * ticketing key. Either provider failing still returns the other, because half
 * the listings beat an error page.
 */
export async function fetchEventsBundle(
  lat: number,
  lon: number,
  radiusM: number,
): Promise<EventsBundle> {
  const [sportsResult, ticketsResult] = await Promise.allSettled([
    sportsNearby(lat, lon, radiusM),
    ticketmasterNearby(lat, lon, radiusM),
  ])

  const sports = sportsResult.status === 'fulfilled' ? sportsResult.value : []
  const tickets = ticketsResult.status === 'fulfilled' ? ticketsResult.value : []

  if (sportsResult.status === 'rejected') {
    console.error('sports fixtures failed:', sportsResult.reason)
  }
  const ticketingConfigured = !(
    ticketsResult.status === 'rejected' && ticketsResult.reason instanceof EventsNotConfiguredError
  )
  if (ticketsResult.status === 'rejected' && ticketingConfigured) {
    console.error('ticketing failed:', ticketsResult.reason)
  }

  /*
   * Ticketmaster also lists many games, so the same fixture can arrive twice.
   * Ticketmaster's version wins: it carries prices and artwork. Matched on date
   * plus venue plus a loose name overlap, since the two word titles differently
   * ("Rams vs. Seahawks" against "Los Angeles Rams at Seattle Seahawks").
   */
  const merged = [...tickets]
  for (const fixture of sports) {
    const duplicate = tickets.some(
      (ticket) =>
        ticket.date === fixture.date &&
        sameVenue(ticket.venueName, fixture.venueName) &&
        namesOverlap(ticket.name, fixture.name),
    )
    if (!duplicate) merged.push(fixture)
  }

  merged.sort((a, b) => {
    const byWhen = `${a.date}${a.time ?? '99:99'}`.localeCompare(`${b.date}${b.time ?? '99:99'}`)
    return byWhen !== 0 ? byWhen : a.name.localeCompare(b.name)
  })

  return {
    events: merged,
    sources: { espn: sports.length > 0, ticketmaster: tickets.length > 0 },
    ticketingConfigured,
    venuesPending: pendingVenueCount(),
  }
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

function sameVenue(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  return normalizeText(a) === normalizeText(b)
}

/** True when the titles share enough distinctive words to be the same fixture. */
function namesOverlap(a: string, b: string): boolean {
  const skip = new Set(['at', 'vs', 'v', 'the', 'and'])
  const words = (value: string) =>
    new Set(normalizeText(value).split(' ').filter((word) => word.length > 2 && !skip.has(word)))

  const left = words(a)
  const right = words(b)
  if (left.size === 0 || right.size === 0) return false

  let shared = 0
  for (const word of left) if (right.has(word)) shared += 1
  return shared >= Math.min(2, Math.min(left.size, right.size))
}
