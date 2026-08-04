import { haversineKm } from './places.ts'

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

export async function fetchEvents(
  lat: number,
  lon: number,
  radiusM: number,
): Promise<EventsResult> {
  const apiKey = process.env.TICKETMASTER_API_KEY?.trim()
  if (!apiKey) throw new EventsNotConfiguredError('No events provider configured.')

  const key = cacheKey(lat, lon, radiusM)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { events: hit.events, cached: true }
  }

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
  return { events, cached: false }
}
