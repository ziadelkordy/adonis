/*
 * Places from Google, as an alternative to OpenStreetMap.
 *
 * WHY
 *
 * Overpass is unreliable from this host in a way that shows up as a broken app.
 * Measured against the deployed service for cities outside the pre-warmed cache:
 * Austin succeeded, Chicago failed twice then succeeded, London failed three times
 * out of three. A friend opening this in a new city gets an error roughly half the
 * time, and no amount of caching helps a first request that never lands. Google's
 * coverage and uptime solve that.
 *
 * WHAT THE LICENCE FORBIDS, AND WHAT THAT COSTS US
 *
 * The Maps Platform terms are materially stricter than OSM's, and two clauses
 * shape this whole file:
 *
 *   1. No warehousing. Place IDs may be stored indefinitely and coordinates for up
 *      to 30 days, but names, hours, ratings, photos and phone numbers must be
 *      requested live and not stored. So unlike the OSM path, nothing here is
 *      written to the `places` table — the cache that makes the OSM path survive
 *      an Overpass outage cannot legally exist for Google data.
 *
 *   2. No display on a non-Google map. Adonis renders Leaflet over OSM tiles, so
 *      while Google is the active provider the map must be swapped for a Google
 *      map. Until that is done, this provider powers lists and detail text only.
 *
 * Both are why OSM remains the default and this is opt-in: turning it on trades a
 * cache we control for a dependency we may not cache, and requires a billing
 * account with a card on file.
 */

import { type Category, type Place, UpstreamError, haversineKm } from './places.ts'

/**
 * Absent means OSM stays in charge. Deliberately fail-soft rather than throwing at
 * boot: the app is fully functional without Google, and an unset key is the normal
 * state, not a misconfiguration.
 */
const API_KEY = process.env.GOOGLE_MAPS_API_KEY ?? ''

export function isGoogleConfigured(): boolean {
  return API_KEY.length > 0
}

const SEARCH_URL = 'https://places.googleapis.com/v1/places:searchNearby'

/*
 * Requested fields, billed by tier — a field mask is mandatory and asking for
 * everything is how people get surprise invoices. This is the minimum that fills
 * a card: identity, position, category, hours, contact and price level.
 */
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.location',
  'places.types',
  'places.primaryType',
  'places.shortFormattedAddress',
  'places.regularOpeningHours.weekdayDescriptions',
  'places.websiteUri',
  'places.nationalPhoneNumber',
  'places.priceLevel',
].join(',')

/*
 * Google's place types mapped onto our categories.
 *
 * Ordered most-specific first and matched in order, because a single place carries
 * several types — a theme park is also a "tourist_attraction", and a brewery is
 * both "bar" and "food". The first match wins, so the narrower reading is listed
 * above the broader one.
 */
const TYPE_TO_CATEGORY: [string, Category][] = [
  ['amusement_park', 'fun'],
  // A water park is an amusement park with slides, not a body of water. The OSM
  // path already classifies leisure=water_park as fun, and the two providers must
  // agree or the same place changes category depending on who answered.
  ['water_park', 'fun'],
  ['zoo', 'fun'],
  ['aquarium', 'fun'],
  ['bowling_alley', 'fun'],
  ['movie_theater', 'fun'],
  ['casino', 'fun'],
  ['night_club', 'nightlife'],
  ['bar', 'nightlife'],
  ['pub', 'nightlife'],
  ['museum', 'culture'],
  ['art_gallery', 'culture'],
  ['library', 'culture'],
  ['performing_arts_theater', 'culture'],
  ['historical_landmark', 'culture'],
  ['art_studio', 'creative'],
  ['spa', 'wellness'],
  ['beauty_salon', 'wellness'],
  ['yoga_studio', 'wellness'],
  ['gym', 'wellness'],
  ['market', 'market'],
  ['farmers_market', 'market'],
  ['supermarket', 'market'],
  ['beach', 'water'],
  ['marina', 'water'],
  ['national_park', 'outdoors'],
  ['state_park', 'outdoors'],
  ['park', 'outdoors'],
  ['hiking_area', 'outdoors'],
  ['garden', 'outdoors'],
  ['restaurant', 'food'],
  ['cafe', 'food'],
  ['coffee_shop', 'food'],
  ['bakery', 'food'],
  ['ice_cream_shop', 'food'],
  ['tourist_attraction', 'fun'],
]

/** Google type strings to request per category, for a targeted search. */
const CATEGORY_TO_TYPES: Record<Category, string[]> = {
  food: ['restaurant', 'cafe', 'bakery', 'ice_cream_shop'],
  outdoors: ['park', 'national_park', 'hiking_area', 'garden'],
  water: ['beach', 'marina'],
  culture: ['museum', 'art_gallery', 'library', 'performing_arts_theater'],
  nightlife: ['bar', 'night_club', 'pub'],
  fun: ['amusement_park', 'water_park', 'zoo', 'aquarium', 'bowling_alley', 'movie_theater'],
  creative: ['art_studio', 'art_gallery'],
  wellness: ['spa', 'gym', 'yoga_studio'],
  market: ['market', 'supermarket', 'farmers_market'],
}

/** Minutes. Mirrors the OSM path so a day's estimates don't shift with provider. */
const DEFAULT_DURATION_MIN: Record<Category, number> = {
  food: 60,
  outdoors: 75,
  water: 90,
  culture: 75,
  nightlife: 90,
  fun: 120,
  creative: 60,
  wellness: 60,
  market: 45,
}

export function categoryFor(types: string[], primary?: string): Category | null {
  const all = primary ? [primary, ...types] : types
  for (const [type, category] of TYPE_TO_CATEGORY) {
    if (all.includes(type)) return category
  }
  return null
}

/*
 * PRICE_LEVEL_FREE is the only value that maps cleanly onto our `fee` flag.
 * Everything above it means "costs money"; UNSPECIFIED means Google doesn't know,
 * which is not the same as free and must stay null.
 */
export function feeFor(priceLevel?: string): boolean | null {
  if (!priceLevel || priceLevel === 'PRICE_LEVEL_UNSPECIFIED') return null
  return priceLevel !== 'PRICE_LEVEL_FREE'
}

interface GooglePlace {
  id?: string
  displayName?: { text?: string }
  location?: { latitude?: number; longitude?: number }
  types?: string[]
  primaryType?: string
  shortFormattedAddress?: string
  regularOpeningHours?: { weekdayDescriptions?: string[] }
  websiteUri?: string
  nationalPhoneNumber?: string
  priceLevel?: string
}

/**
 * Nearby places from Google.
 *
 * Returns them shaped exactly like the OSM path so nothing downstream has to know
 * which provider answered — including the `google/` id prefix, which keeps saved
 * and scheduled rows unambiguous if a user's data spans both providers.
 *
 * Never writes to the database. That is the licence, not an oversight: see the
 * header. It also means every request costs an API call, so the field mask is kept
 * tight and `maxResultCount` is capped.
 */
export async function fetchNearbyFromGoogle(
  lat: number,
  lon: number,
  radiusM: number,
  categories: Category[],
): Promise<Place[]> {
  if (!API_KEY) throw new UpstreamError('Google Places is not configured')

  const requestedTypes = [...new Set(categories.flatMap((category) => CATEGORY_TO_TYPES[category]))]

  let response: Response
  try {
    response = await fetch(SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify({
        locationRestriction: {
          circle: {
            center: { latitude: lat, longitude: lon },
            // Google caps the radius at 50km.
            radius: Math.min(radiusM, 50_000),
          },
        },
        includedTypes: requestedTypes,
        // The API's own ceiling. Ranked by prominence, so the cut keeps the best.
        maxResultCount: 20,
      }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new UpstreamError('Google Places did not respond')
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } }
    throw new UpstreamError(body.error?.message ?? `Google Places returned ${response.status}`)
  }

  const payload = (await response.json()) as { places?: GooglePlace[] }

  const places: Place[] = []
  for (const raw of payload.places ?? []) {
    const name = raw.displayName?.text?.trim()
    const latitude = raw.location?.latitude
    const longitude = raw.location?.longitude
    if (!raw.id || !name || typeof latitude !== 'number' || typeof longitude !== 'number') continue

    const category = categoryFor(raw.types ?? [], raw.primaryType)
    if (!category) continue

    // The request was a circle, but trim anyway rather than trusting the upstream.
    if (haversineKm(lat, lon, latitude, longitude) * 1000 > radiusM) continue

    places.push({
      id: `google/${raw.id}`,
      name,
      category,
      lat: latitude,
      lon: longitude,
      neighborhood: raw.shortFormattedAddress ?? null,
      // Joined rather than parsed: displayed verbatim, exactly as the OSM path
      // treats its raw opening_hours string.
      openingHours: raw.regularOpeningHours?.weekdayDescriptions?.join('; ') ?? null,
      website: raw.websiteUri ?? null,
      phone: raw.nationalPhoneNumber ?? null,
      fee: feeFor(raw.priceLevel),
      cuisine: null,
      durationMin: DEFAULT_DURATION_MIN[category],
      // Empty, and must stay empty: warehousing Google's fields is prohibited, and
      // this object is never persisted.
      tags: {},
    })
  }

  return places
}
