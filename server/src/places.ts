import { sql } from './db.ts'

/** Identifies us to the free OSM services, as their usage policies require. */
const USER_AGENT = 'Sundial/0.1 (personal project; local development)'

/*
 * Several Overpass endpoints, tried in order.
 *
 * The main instance is unreachable from at least some hosting providers — from
 * Render every request failed with a connection error while Nominatim (same
 * project, same egress) worked fine, which points at overpass-api.de refusing
 * datacenter IP ranges rather than anything wrong locally. One hard-coded host
 * therefore means the entire app breaks on deploy for any area not already cached.
 *
 * OVERPASS_URLS overrides the list (comma-separated) without a code change.
 */
const OVERPASS_URLS: string[] = (
  process.env.OVERPASS_URLS ??
  [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.osm.jp/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  ].join(',')
)
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean)

/** Remembers which endpoint last worked, so we start there next time. */
let preferredOverpass = 0
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse'
const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search'

export const CATEGORIES = [
  'outdoors',
  'water',
  'food',
  'wellness',
  'culture',
  'nightlife',
  'creative',
  'market',
  'fun',
] as const

export type Category = (typeof CATEGORIES)[number]

/**
 * Our categories expressed as OSM tag filters. Order matters: `categoryFor`
 * walks these in sequence and takes the first match, so narrower categories
 * (water, market) are listed before broader ones (outdoors, food).
 */
const CATEGORY_FILTERS: Record<Category, Array<[string, string]>> = {
  /*
   * Listed first so the unambiguously-amusement tags win. A water park is
   * "fun" rather than "on the water", which is why it lives here and not below.
   */
  fun: [
    ['tourism', 'theme_park'],
    ['tourism', 'zoo'],
    ['tourism', 'aquarium'],
    ['tourism', 'attraction'],
    ['leisure', 'water_park'],
    ['leisure', 'amusement_arcade'],
    ['leisure', 'bowling_alley'],
    ['leisure', 'escape_game'],
    ['leisure', 'trampoline_park'],
    ['leisure', 'miniature_golf'],
    ['leisure', 'ice_rink'],
    ['amenity', 'casino'],
  ],
  water: [
    ['natural', 'beach'],
    ['leisure', 'marina'],
    ['leisure', 'swimming_pool'],
  ],
  market: [
    ['amenity', 'marketplace'],
    ['shop', 'greengrocer'],
    ['shop', 'farm'],
  ],
  wellness: [
    ['leisure', 'spa'],
    ['leisure', 'sauna'],
    ['amenity', 'public_bath'],
    ['shop', 'massage'],
  ],
  culture: [
    ['tourism', 'museum'],
    ['tourism', 'gallery'],
    ['tourism', 'artwork'],
    ['amenity', 'arts_centre'],
    ['amenity', 'theatre'],
    ['amenity', 'cinema'],
    ['amenity', 'library'],
  ],
  nightlife: [
    ['amenity', 'bar'],
    ['amenity', 'pub'],
    ['amenity', 'nightclub'],
  ],
  creative: [
    ['shop', 'art'],
    ['shop', 'pottery'],
    ['craft', 'pottery'],
    ['craft', 'photographer'],
  ],
  food: [
    ['amenity', 'cafe'],
    ['amenity', 'restaurant'],
    ['amenity', 'ice_cream'],
    ['amenity', 'bakery'],
    ['shop', 'bakery'],
  ],
  outdoors: [
    ['leisure', 'park'],
    ['leisure', 'garden'],
    ['leisure', 'nature_reserve'],
    ['tourism', 'viewpoint'],
    // leisure=pitch is deliberately absent: measured at ~30s for 3 results,
    // and a named sports pitch is marginal for planning a day out anyway.
  ],
}

/**
 * OSM records no visit duration, so scheduling needs a sensible default per
 * category. These are honest guesses, not data — the UI says so.
 */
const DEFAULT_DURATION_MIN: Record<Category, number> = {
  outdoors: 75,
  water: 90,
  food: 60,
  wellness: 90,
  culture: 105,
  nightlife: 105,
  creative: 105,
  market: 60,
  fun: 120,
}

export interface Place {
  id: string
  name: string
  category: Category
  lat: number
  lon: number
  neighborhood: string | null
  openingHours: string | null
  website: string | null
  phone: string | null
  /** true = costs money, false = explicitly free, null = OSM doesn't say. */
  fee: boolean | null
  cuisine: string | null
  durationMin: number
  /** Only present on responses derived from a user location. */
  distanceKm?: number
}

interface OverpassElement {
  type: string
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

export function haversineKm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const R = 6371
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLon = toRad(bLon - aLon)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/*
 * Small physical markers rather than somewhere you'd go: a milestone, a plaque,
 * a memorial stone. These carry tourism=attraction in OSM but are signposts.
 */
const HISTORIC_MARKERS = new Set([
  'milestone',
  'memorial',
  'plaque',
  'boundary_stone',
  'wayside_cross',
  'wayside_shrine',
  'survey_point',
])

/**
 * Rejects individual rides and roadside markers.
 *
 * In OSM an `attraction=*` tag means a single ride or feature *inside* a park —
 * `attraction=roller_coaster`, `big_wheel`, `carousel`, `amusement_ride`. Those
 * are not destinations: listing "West Coaster" and "Pacific Wheel" alongside
 * Pacific Park is noise, since you go to the park, not to one ride.
 *
 * Note the parent venues are unaffected: Pacific Park is `tourism=theme_park`
 * and Santa Monica Pier is `man_made=pier` + `tourism=attraction`, and neither
 * carries an `attraction` tag.
 */
function isRideOrMarker(tags: Record<string, string>): boolean {
  if (tags.attraction) return true
  if (tags.historic && HISTORIC_MARKERS.has(tags.historic)) return true
  return false
}

function categoryFor(tags: Record<string, string>): Category | null {
  for (const category of Object.keys(CATEGORY_FILTERS) as Category[]) {
    for (const [key, value] of CATEGORY_FILTERS[category]) {
      if (tags[key] === value) return category
    }
  }
  return null
}

/*
 * Metres per degree of latitude, taken at its *smallest* (at the equator; it
 * grows to ~111,694 at the poles). Deliberately conservative: dividing by a
 * smaller number yields a slightly larger box, and the box erring outwards is
 * free — the true circular radius is enforced afterwards with haversine — whereas
 * erring inwards silently drops places that are genuinely within range.
 *
 * The earlier value here, 111,320, is the figure for *longitude* at the equator.
 * Used for latitude it made the box ~0.1% too small, clipping results in the last
 * couple of metres of the radius.
 */
const MIN_METERS_PER_DEG_LAT = 110_574

/** A little extra, so floating-point error can't nibble at the edges either. */
const BBOX_PAD = 1.01

export function boundingBox(
  lat: number,
  lon: number,
  radiusM: number,
): { south: number; west: number; north: number; east: number } {
  const padded = radiusM * BBOX_PAD
  const dLat = padded / MIN_METERS_PER_DEG_LAT
  // Longitude degrees shrink towards the poles; the floor keeps this finite there.
  const dLon = padded / (MIN_METERS_PER_DEG_LAT * Math.max(Math.cos((lat * Math.PI) / 180), 0.01))
  return { south: lat - dLat, west: lon - dLon, north: lat + dLat, east: lon + dLon }
}

/**
 * Builds one regex clause per OSM key inside a single global `[bbox:...]`.
 *
 * Two hard-won details:
 *  - Grouping by key gives ~6 clauses instead of 35+; each clause is its own
 *    lookup, and the per-tag-pair version blew Overpass's timeout every time.
 *  - A global bbox is dramatically cheaper than a per-clause `(around:...)`.
 *    Measured on the same area: `around` timed out silently at 65s, bbox
 *    returned 320 places in 6s. The bbox is a square, so results are filtered
 *    down to the true circular radius afterwards with haversine.
 */
function buildQuery(lat: number, lon: number, radiusM: number, categories: Category[]): string {
  const valuesByKey = new Map<string, Set<string>>()

  for (const category of categories) {
    for (const [key, value] of CATEGORY_FILTERS[category]) {
      const values = valuesByKey.get(key) ?? new Set<string>()
      values.add(value)
      valuesByKey.set(key, values)
    }
  }

  const clauses = [...valuesByKey.entries()]
    .map(([key, values]) => {
      const list = [...values]
      // All tag values here are plain [a-z_] literals, so no escaping is needed.
      const match = list.length === 1 ? `="${list[0]}"` : `~"^(${list.join('|')})$"`
      return `nwr["${key}"${match}]["name"];`
    })
    .join('\n  ')

  const { south, west, north, east } = boundingBox(lat, lon, radiusM)
  const bbox = [south, west, north, east].map((value) => value.toFixed(5)).join(',')

  return `[out:json][timeout:60][bbox:${bbox}];\n(\n  ${clauses}\n);\nout center 400;`
}

function normalize(element: OverpassElement): Place | null {
  const tags = element.tags ?? {}
  const name = tags.name?.trim()
  if (!name) return null
  if (isRideOrMarker(tags)) return null

  const point = element.center ?? { lat: element.lat, lon: element.lon }
  if (typeof point.lat !== 'number' || typeof point.lon !== 'number') return null

  const category = categoryFor(tags)
  if (!category) return null

  return {
    id: `${element.type}/${element.id}`,
    name,
    category,
    lat: point.lat,
    lon: point.lon,
    neighborhood: tags['addr:suburb'] ?? tags['addr:city'] ?? null,
    openingHours: tags.opening_hours ?? null,
    website: tags.website ?? tags['contact:website'] ?? null,
    phone: tags.phone ?? tags['contact:phone'] ?? null,
    fee: tags.fee === 'yes' ? true : tags.fee === 'no' ? false : null,
    cuisine: tags.cuisine ?? null,
    durationMin: DEFAULT_DURATION_MIN[category],
  }
}

/* -------------------------------------------------------------------------- */
/* Nominatim (reverse geocoding)                                               */
/* -------------------------------------------------------------------------- */

let lastNominatimCall = 0

/** Nominatim's policy caps callers at 1 request/second. */
async function throttleNominatim(): Promise<void> {
  const since = Date.now() - lastNominatimCall
  if (since < 1100) await new Promise((resolve) => setTimeout(resolve, 1100 - since))
  lastNominatimCall = Date.now()
}

export interface PlaceName {
  label: string
  city: string | null
  /** State/province, used to prioritise which event venues to geocode first. */
  region: string | null
  country: string | null
}

export async function reverseGeocode(lat: number, lon: number): Promise<PlaceName | null> {
  await throttleNominatim()

  const url = `${NOMINATIM_URL}?lat=${lat}&lon=${lon}&format=json&zoom=14&addressdetails=1`
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!response.ok) return null

  const body = (await response.json()) as {
    name?: string
    address?: Record<string, string>
  }

  const address = body.address ?? {}
  const city =
    address.city ?? address.town ?? address.village ?? address.municipality ?? address.suburb ?? null

  return {
    label: body.name?.trim() || city || 'your area',
    city,
    region: address.state ?? address.region ?? null,
    country: address.country ?? null,
  }
}

/**
 * Forward geocoding: a free-text place name to coordinates. Used for event venues,
 * which arrive as "SoFi Stadium, Inglewood, California" with no coordinates.
 *
 * Shares `throttleNominatim` with the reverse lookup, so the two together stay
 * inside Nominatim's one-request-per-second policy.
 */
export async function geocodePlace(query: string): Promise<{ lat: number; lon: number } | null> {
  await throttleNominatim()

  const url = `${NOMINATIM_SEARCH_URL}?q=${encodeURIComponent(query)}&format=json&limit=1`
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) return null

  const body = (await response.json()) as Array<{ lat?: string; lon?: string }>
  const first = body[0]
  if (!first?.lat || !first?.lon) return null

  const lat = Number(first.lat)
  const lon = Number(first.lon)
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null
}

/* -------------------------------------------------------------------------- */
/* Overpass (places)                                                           */
/* -------------------------------------------------------------------------- */

/*
 * Bump whenever the tag filters or normalisation change. It is part of the cache
 * key, so old entries stop matching instead of quietly serving results shaped by
 * the previous rules — otherwise a filtering fix appears to do nothing in any
 * area already cached.
 *
 * v2: rides (attraction=*) and roadside markers excluded.
 * v3: bounding box widened — the previous one was ~0.1% too small and clipped
 *     places in the outermost metres of the radius.
 */
const NORMALIZER_VERSION = 3

/** Cache buckets are ~1km, which is granular enough without thrashing the cache. */
function cacheKey(lat: number, lon: number, radiusM: number, categories: Category[]): string {
  return [
    `v${NORMALIZER_VERSION}`,
    lat.toFixed(2),
    lon.toFixed(2),
    radiusM,
    [...categories].sort().join('+'),
  ].join(':')
}

const CACHE_TTL_HOURS = 24 * 7

async function readCache(key: string): Promise<Place[] | null> {
  const rows = await sql<{ place_ids: string[] }[]>`
    SELECT place_ids FROM place_queries
    WHERE cache_key = ${key}
      AND fetched_at > now() - ${`${CACHE_TTL_HOURS} hours`}::interval
  `
  const ids = rows[0]?.place_ids
  if (!ids || ids.length === 0) return null
  return loadPlaces(ids)
}

export async function loadPlaces(ids: string[]): Promise<Place[]> {
  if (ids.length === 0) return []

  const rows = await sql<
    Array<{
      id: string
      name: string
      category: string
      lat: number
      lon: number
      neighborhood: string | null
      opening_hours: string | null
      website: string | null
      phone: string | null
      fee: boolean | null
      cuisine: string | null
      duration_min: number
    }>
  >`
    SELECT id, name, category, lat, lon, neighborhood, opening_hours,
           website, phone, fee, cuisine, duration_min
    FROM places
    WHERE id = ANY(${ids})
  `

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category as Category,
    lat: Number(row.lat),
    lon: Number(row.lon),
    neighborhood: row.neighborhood,
    openingHours: row.opening_hours,
    website: row.website,
    phone: row.phone,
    fee: row.fee,
    cuisine: row.cuisine,
    durationMin: row.duration_min,
  }))
}

async function upsertPlaces(places: Place[]): Promise<void> {
  if (places.length === 0) return

  const rows = places.map((place) => ({
    id: place.id,
    name: place.name,
    category: place.category,
    lat: place.lat,
    lon: place.lon,
    neighborhood: place.neighborhood,
    opening_hours: place.openingHours,
    website: place.website,
    phone: place.phone,
    fee: place.fee,
    cuisine: place.cuisine,
    duration_min: place.durationMin,
  }))

  await sql`
    INSERT INTO places ${sql(rows)}
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      category = EXCLUDED.category,
      lat = EXCLUDED.lat,
      lon = EXCLUDED.lon,
      neighborhood = EXCLUDED.neighborhood,
      opening_hours = EXCLUDED.opening_hours,
      website = EXCLUDED.website,
      phone = EXCLUDED.phone,
      fee = EXCLUDED.fee,
      cuisine = EXCLUDED.cuisine,
      duration_min = EXCLUDED.duration_min,
      fetched_at = now()
  `
}

export class UpstreamError extends Error {}

/*
 * overpass-api.de load-balances across backends of very different health — the
 * identical query measured 6s on one and a 504 on another, minutes apart, while
 * the status endpoint reported free slots either way.
 *
 * So: give up on a slow backend quickly rather than waiting out its timeout, and
 * retry. A retry usually lands on a different, healthy backend. Failing fast and
 * retrying beats waiting patiently here.
 */
const ATTEMPT_TIMEOUT_MS = 30_000
const RETRY_DELAYS_MS = [0, 1000, 2500, 5000]

async function queryOverpass(query: string): Promise<OverpassElement[]> {
  let lastMessage = 'unknown error'

  /*
   * Endpoint rotation sits outside the retry loop: a backoff retry helps with a
   * momentarily overloaded server, but not with one that simply refuses us. Start
   * from whichever endpoint last succeeded so the common case costs one request.
   */
  for (let hop = 0; hop < OVERPASS_URLS.length; hop += 1) {
    const index = (preferredOverpass + hop) % OVERPASS_URLS.length
    const endpoint = OVERPASS_URLS[index]

    for (const delay of RETRY_DELAYS_MS) {
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))

      let text: string
      let status: number

      try {
        const response = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, {
          headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
          signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
        })
        status = response.status
        text = await response.text()
      } catch (error) {
        lastMessage =
          error instanceof Error && error.name === 'TimeoutError'
            ? `${endpoint} did not respond in time`
            : `could not reach ${endpoint}`
        // A refused connection won't improve on retry; move to the next endpoint.
        break
      }

      if (status !== 200) {
        lastMessage = `${endpoint} returned ${status}`
        continue
      }
      if (!text.trimStart().startsWith('{')) {
        // Overpass reports runtime errors as an HTML page with a 200 status.
        lastMessage = `${endpoint} returned an error page instead of data`
        continue
      }

      try {
        const elements = (JSON.parse(text) as { elements?: OverpassElement[] }).elements ?? []
        if (index !== preferredOverpass) {
          console.log(`Overpass: switched to ${endpoint}`)
          preferredOverpass = index
        }
        return elements
      } catch {
        lastMessage = `${endpoint} returned malformed JSON`
      }
    }
  }

  throw new UpstreamError(lastMessage)
}

export interface NearbyResult {
  places: Place[]
  /** True when served from Postgres without touching OpenStreetMap. */
  cached: boolean
}

/* -------------------------------------------------------------------------- */
/* Escapes — trip-worthy places further out                                    */
/* -------------------------------------------------------------------------- */

/*
 * A deliberately narrow tag set: things worth a drive, not the nearest park or
 * swimming pool. Kept separate from CATEGORY_FILTERS rather than added as a tenth
 * category, because these tags already belong to water/outdoors/fun and
 * `categoryFor` takes the first match — a new category listed first would quietly
 * steal every beach and viewpoint out of the Nearby tab.
 */
const ESCAPE_FILTERS: Array<[string, string]> = [
  ['natural', 'beach'],
  ['leisure', 'nature_reserve'],
  ['leisure', 'water_park'],
  ['tourism', 'theme_park'],
  ['tourism', 'zoo'],
  ['tourism', 'aquarium'],
  ['tourism', 'viewpoint'],
]

/**
 * Measured ceiling. At 60km the public Overpass instance returns a 504 every
 * time; 40km takes ~30s and succeeds. Escapes are cached for a week afterwards,
 * so that cost is paid once per area.
 */
export const ESCAPE_MAX_RADIUS_M = 40_000

function buildEscapeQuery(lat: number, lon: number, radiusM: number): string {
  const valuesByKey = new Map<string, Set<string>>()
  for (const [key, value] of ESCAPE_FILTERS) {
    const values = valuesByKey.get(key) ?? new Set<string>()
    values.add(value)
    valuesByKey.set(key, values)
  }

  const clauses = [...valuesByKey.entries()]
    .map(([key, values]) => {
      const list = [...values]
      const match = list.length === 1 ? `="${list[0]}"` : `~"^(${list.join('|')})$"`
      return `nwr["${key}"${match}]["name"];`
    })
    .join('\n  ')

  const { south, west, north, east } = boundingBox(lat, lon, radiusM)
  const bbox = [south, west, north, east].map((value) => value.toFixed(5)).join(',')

  return `[out:json][timeout:60][bbox:${bbox}];\n(\n  ${clauses}\n);\nout center 400;`
}

export async function fetchEscapes(
  lat: number,
  lon: number,
  requestedRadiusM: number,
): Promise<NearbyResult> {
  const radiusM = Math.min(requestedRadiusM, ESCAPE_MAX_RADIUS_M)
  // Distinct prefix so escapes and nearby never read each other's cache entries.
  const key = `escapes:${cacheKey(lat, lon, radiusM, [])}`

  const cached = await readCache(key)
  if (cached) return { places: withDistance(cached, lat, lon), cached: true }

  const elements = await queryOverpass(buildEscapeQuery(lat, lon, radiusM))

  const byId = new Map<string, Place>()
  for (const element of elements) {
    const place = normalize(element)
    if (place && haversineKm(lat, lon, place.lat, place.lon) * 1000 <= radiusM) {
      byId.set(place.id, place)
    }
  }
  const places = [...byId.values()]

  await upsertPlaces(places)
  if (places.length > 0) {
    await sql`
      INSERT INTO place_queries (cache_key, place_ids, fetched_at)
      VALUES (${key}, ${places.map((place) => place.id)}, now())
      ON CONFLICT (cache_key) DO UPDATE SET
        place_ids = EXCLUDED.place_ids, fetched_at = now()
    `
  }

  return { places: withDistance(places, lat, lon), cached: false }
}

export async function fetchNearby(
  lat: number,
  lon: number,
  radiusM: number,
  categories: Category[],
): Promise<NearbyResult> {
  const key = cacheKey(lat, lon, radiusM, categories)

  const cached = await readCache(key)
  if (cached) {
    return { places: withDistance(cached, lat, lon), cached: true }
  }

  const elements = await queryOverpass(buildQuery(lat, lon, radiusM, categories))

  const byId = new Map<string, Place>()
  for (const element of elements) {
    const place = normalize(element)
    // The query used a square bbox, so trim the corners back to a true circle.
    if (place && haversineKm(lat, lon, place.lat, place.lon) * 1000 <= radiusM) {
      byId.set(place.id, place)
    }
  }
  const places = [...byId.values()]

  await upsertPlaces(places)

  /*
   * Deliberately not cached when empty. An Overpass query that exceeds its own
   * timeout returns a valid, successful, *empty* response — indistinguishable
   * from "genuinely nothing here". Caching that would pin a silent failure in
   * place for a week; leaving it uncached means the next request retries.
   */
  if (places.length > 0) {
    await sql`
      INSERT INTO place_queries (cache_key, place_ids, fetched_at)
      VALUES (${key}, ${places.map((place) => place.id)}, now())
      ON CONFLICT (cache_key) DO UPDATE SET
        place_ids = EXCLUDED.place_ids,
        fetched_at = now()
    `
  }

  return { places: withDistance(places, lat, lon), cached: false }
}

function withDistance(places: Place[], lat: number, lon: number): Place[] {
  return places
    .map((place) => ({
      ...place,
      distanceKm: haversineKm(lat, lon, place.lat, place.lon),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
}

export { DEFAULT_DURATION_MIN }
