/*
 * Real photographs for places, from Wikipedia and Wikimedia Commons.
 *
 * WHY THE MATCHING IS SO STRICT
 *
 * The obvious approach — ask Wikipedia for articles near a coordinate and use the
 * first photo — produces confident, wrong results. Measured against real cached
 * places around Milpitas:
 *
 *   "Tom Evatt Park"     -> Great Mall of the Bay Area
 *   "Peet's Coffee"      -> Calaveras right of way preparation
 *   "Park Metro East"    -> Flextronics HQ
 *
 * Geosearch answers "what is near here", never "what is this". Wikimedia Commons
 * geosearch is worse: 12 of 22 sampled places had a geotagged photo within 300m
 * and almost none were photos of the place. Both were rejected as sources.
 *
 * So a photo is accepted only on two independent agreements: the article's title
 * matches the place's name, AND the article's own coordinates sit within
 * MAX_DISTANCE_KM of the place. Either alone is not enough — names repeat across
 * a country, and proximity is what produced every failure above.
 *
 * The cost is coverage, and it is a big cost, measured rather than guessed:
 * ~28% of escapes resolve, ~0% of everyday suburban cafés and parks, which have
 * no article to find. That is the honest ceiling for free photo data, and callers
 * are expected to fall back to generated artwork rather than treat a missing
 * photo as an error. A wrong photo is worse than no photo.
 */

import { sql } from './db.ts'

export interface Photo {
  url: string
  width: number
  height: number
  /** Display credit, already assembled: "Jane Doe / CC BY-SA 4.0". */
  credit: string | null
  /** Wikipedia article the photo came from, shown as the source link. */
  articleTitle: string
  articleUrl: string
}

interface Subject {
  id: string
  name: string
  lat: number
  lon: number
}

/*
 * Wikimedia asks unauthenticated clients to identify themselves and to keep to
 * roughly serial requests. Both are honoured: an anonymous flood earns a 429
 * within about a dozen calls, which is exactly what happened while measuring.
 */
const USER_AGENT = 'Adonis/1.0 (https://adonis-tnyu.onrender.com; personal day-planner)'
const MIN_INTERVAL_MS = 1100

/**
 * How far an article's coordinates may sit from the place. Generous because a
 * park's article is pinned at its centroid while OSM may pin an entrance —
 * legitimate matches were observed up to 1.9km — but far tighter than the
 * ~5-10km at which unrelated landmarks in the same town start matching.
 */
export const MAX_DISTANCE_KM = 6

/** Re-check places that had no photo, in case an article appeared since. */
const MISS_TTL_DAYS = 30

let lastCall = 0

async function throttle(): Promise<void> {
  const since = Date.now() - lastCall
  if (since < MIN_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_INTERVAL_MS - since))
  }
  lastCall = Date.now()
}

async function wikiFetch(url: string): Promise<unknown | null> {
  await throttle()
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) return null
    return await response.json()
  } catch {
    // Network failure or timeout. Treated as "unknown", never cached as a miss,
    // so a Wikimedia outage doesn't permanently blank a place's photo.
    return null
  }
}

/* -------------------------------------------------------------------------- */
/* Matching                                                                    */
/* -------------------------------------------------------------------------- */

export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371
  const rad = Math.PI / 180
  const h =
    Math.sin(((bLat - aLat) * rad) / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(((bLon - aLon) * rad) / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/*
 * Dropped before comparing titles. These words are so common in place names that
 * keeping them lets "Selwyn Park" score a match against "Regional Park" purely on
 * the shared word.
 */
const STOP_WORDS = new Set([
  'the',
  'of',
  'and',
  'at',
  'county',
  'park',
  'area',
  'center',
  'centre',
  'city',
  'national',
  'state',
  'regional',
  'open',
  'space',
  'preserve',
  'trail',
  'public',
])

function distinctiveWords(value: string): Set<string> {
  const words = value.toLowerCase().match(/[a-z0-9]+/g) ?? []
  return new Set(words.filter((word) => word.length > 2 && !STOP_WORDS.has(word)))
}

/*
 * Wikipedia disambiguates same-named articles in parentheses: "Castle Rock State
 * Park (California)", "Recreation Park (Long Beach, California)". Those words
 * describe which article this is, not what the place is called, and counting them
 * lets a shared state name carry a match on its own — "California Recreation
 * Center" scored against "Recreation Park (Long Beach, California)" purely
 * because both mention California.
 */
function withoutDisambiguator(title: string): string {
  return title.replace(/\s*\([^)]*\)\s*$/, '').trim()
}

/** True when most of the place's distinctive words appear in the article title. */
export function titlesAgree(placeName: string, articleTitle: string): boolean {
  const place = distinctiveWords(placeName)
  const article = distinctiveWords(withoutDisambiguator(articleTitle))
  if (place.size === 0 || article.size === 0) return false

  let shared = 0
  for (const word of place) if (article.has(word)) shared += 1
  return shared / place.size >= 0.6
}

/* -------------------------------------------------------------------------- */
/* Resolution                                                                  */
/* -------------------------------------------------------------------------- */

interface WikiPage {
  title?: string
  thumbnail?: { source?: string; width?: number; height?: number }
  pageimage?: string
  coordinates?: { lat?: number; lon?: number }[]
}

interface Candidate {
  articleTitle: string
  url: string
  width: number
  height: number
  fileTitle: string | null
  distanceKm: number
}

/*
 * Wikipedia titles a settlement's article "Calabasas, California". Those articles
 * are close by, carry coordinates and share the place's distinctive word, so they
 * pass both checks — and then illustrate a park with an aerial view of the town,
 * or worse, with the district's locator map.
 *
 * Observed: "Calabasas Open Space" -> "Calabasas, California",
 * "Bell Canyon Park" -> "Bell Canyon, California".
 *
 * A place is allowed to match a settlement article only when the place is itself
 * that settlement, which its own name having the same shape is a good proxy for.
 */
const SETTLEMENT_TITLE = /^[^,]+, [A-Z][a-z]+(?: [A-Z][a-z]+)*$/

export function isSettlementMismatch(placeName: string, articleTitle: string): boolean {
  return SETTLEMENT_TITLE.test(articleTitle) && !SETTLEMENT_TITLE.test(placeName.trim())
}

/*
 * Not every "image" on an article is a photograph. Locator maps, flags, coats of
 * arms and logos are the standard illustrations on geographic and civic articles,
 * and they are near-uniformly SVG. Bell Canyon's match above was a county locator
 * map — technically an image of the right place, useless as a preview.
 */
const NON_PHOTO_FILE = /\.svg$/i
const NON_PHOTO_HINT = /\b(locator|location map|coat of arms|flag|seal|logo|map of)\b/i

export function isNonPhoto(fileTitle: string | null): boolean {
  if (!fileTitle) return false
  return NON_PHOTO_FILE.test(fileTitle) || NON_PHOTO_HINT.test(fileTitle.replace(/_/g, ' '))
}

/** Searches Wikipedia by name, returning only a two-way verified match. */
async function findArticlePhoto(subject: Subject): Promise<Candidate | null> {
  const url =
    'https://en.wikipedia.org/w/api.php?action=query&format=json&generator=search' +
    `&gsrsearch=${encodeURIComponent(subject.name)}&gsrlimit=6` +
    '&prop=pageimages%7Ccoordinates&piprop=thumbnail%7Cname&pithumbsize=1200'

  const payload = (await wikiFetch(url)) as { query?: { pages?: Record<string, WikiPage> } } | null
  const pages = payload?.query?.pages
  if (!pages) return null

  for (const page of Object.values(pages)) {
    const title = page.title
    const source = page.thumbnail?.source
    if (!title || !source) continue
    if (!titlesAgree(subject.name, title)) continue
    if (isSettlementMismatch(subject.name, title)) continue

    const fileTitle = page.pageimage ? `File:${page.pageimage}` : null
    if (isNonPhoto(fileTitle)) continue

    // No coordinates means the second check cannot be performed, so the match
    // cannot be trusted — reject rather than fall back to the name alone.
    const point = page.coordinates?.[0]
    if (typeof point?.lat !== 'number' || typeof point?.lon !== 'number') continue

    const distanceKm = haversineKm(subject.lat, subject.lon, point.lat, point.lon)
    if (distanceKm > MAX_DISTANCE_KM) continue

    return {
      articleTitle: title,
      url: source,
      width: page.thumbnail?.width ?? 0,
      height: page.thumbnail?.height ?? 0,
      fileTitle,
      distanceKm,
    }
  }
  return null
}

interface CommonsMeta {
  artist: string | null
  license: string | null
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/*
 * Wikipedia reports a file as "Blue_Oak_Ranch_(19071834426).jpg" while Commons
 * echoes it back as "Blue Oak Ranch (19071834426).jpg". Keying the lookup on the
 * raw strings silently missed every single time, so every photo was stored with
 * no author and no licence — which the CC licences do not permit. Both sides go
 * through this before being compared.
 */
export function fileKey(title: string): string {
  return title.replace(/_/g, ' ').trim()
}

/**
 * Licence and author for Commons files.
 *
 * Batched because Commons accepts up to 50 titles per call, which turns
 * attribution for a whole page of results into one request rather than one each.
 */
async function fetchCommonsMeta(fileTitles: string[]): Promise<Map<string, CommonsMeta>> {
  const result = new Map<string, CommonsMeta>()
  if (fileTitles.length === 0) return result

  for (let index = 0; index < fileTitles.length; index += 50) {
    const batch = fileTitles.slice(index, index + 50)
    const url =
      'https://commons.wikimedia.org/w/api.php?action=query&format=json' +
      `&titles=${encodeURIComponent(batch.join('|'))}` +
      '&prop=imageinfo&iiprop=extmetadata'

    const payload = (await wikiFetch(url)) as {
      query?: {
        pages?: Record<
          string,
          { title?: string; imageinfo?: { extmetadata?: Record<string, { value?: string }> }[] }
        >
      }
    } | null

    for (const page of Object.values(payload?.query?.pages ?? {})) {
      const meta = page.imageinfo?.[0]?.extmetadata
      if (!page.title) continue
      const artist = meta?.Artist?.value ? stripHtml(meta.Artist.value) : null
      const license = meta?.LicenseShortName?.value ? stripHtml(meta.LicenseShortName.value) : null
      result.set(fileKey(page.title), {
        // Some credits are a full paragraph of markup; a card cannot show that.
        artist: artist && artist.length <= 80 ? artist : null,
        license,
      })
    }
  }
  return result
}

function creditFrom(artist: string | null, license: string | null): string | null {
  if (artist && license) return `${artist} / ${license}`
  return artist ?? license
}

/* -------------------------------------------------------------------------- */
/* Cache                                                                       */
/* -------------------------------------------------------------------------- */

interface PhotoRow {
  place_id: string
  status: string
  url: string | null
  width: number | null
  height: number | null
  artist: string | null
  license: string | null
  article_title: string | null
  article_url: string | null
}

function toPhoto(row: PhotoRow): Photo | null {
  if (row.status !== 'ok' || !row.url) return null
  return {
    url: row.url,
    width: row.width ?? 0,
    height: row.height ?? 0,
    credit: creditFrom(row.artist, row.license),
    articleTitle: row.article_title ?? '',
    articleUrl: row.article_url ?? '',
  }
}

/** Cached photos for the given place ids. Absent ids simply have no entry. */
export async function getCachedPhotos(placeIds: string[]): Promise<Map<string, Photo>> {
  const photos = new Map<string, Photo>()
  if (placeIds.length === 0) return photos

  const rows = await sql<PhotoRow[]>`
    SELECT place_id, status, url, width, height, artist, license, article_title, article_url
    FROM place_photos
    WHERE place_id = ANY(${placeIds})
  `
  for (const row of rows) {
    const photo = toPhoto(row)
    if (photo) photos.set(row.place_id, photo)
  }
  return photos
}

/** Ids with no usable cache entry — never looked at, or a stale miss. */
export async function unresolvedIds(subjects: Subject[]): Promise<string[]> {
  if (subjects.length === 0) return []
  const ids = subjects.map((subject) => subject.id)

  const rows = await sql<{ place_id: string }[]>`
    SELECT place_id FROM place_photos
    WHERE place_id = ANY(${ids})
      AND (status = 'ok' OR resolved_at > now() - ${`${MISS_TTL_DAYS} days`}::interval)
  `
  const settled = new Set(rows.map((row) => row.place_id))
  return ids.filter((id) => !settled.has(id))
}

/**
 * Resolves photos for the given subjects and writes them to the cache.
 *
 * Serial by necessity — the throttle is per-process and Wikimedia rate-limits
 * hard — so this takes about a second per subject and belongs in a warm run or a
 * background task, never inline in a request.
 *
 * Returns the number that resolved to an actual photo.
 */
export async function resolvePhotos(subjects: Subject[]): Promise<number> {
  const found: { subject: Subject; candidate: Candidate }[] = []
  const misses: string[] = []

  for (const subject of subjects) {
    const candidate = await findArticlePhoto(subject)
    if (candidate) found.push({ subject, candidate })
    else misses.push(subject.id)
  }

  const meta = await fetchCommonsMeta(
    found.map((entry) => entry.candidate.fileTitle).filter((title): title is string => !!title),
  )

  for (const { subject, candidate } of found) {
    const credit = candidate.fileTitle ? meta.get(fileKey(candidate.fileTitle)) : undefined
    await sql`
      INSERT INTO place_photos (
        place_id, status, url, width, height, file_title,
        article_title, article_url, artist, license, distance_km, resolved_at
      ) VALUES (
        ${subject.id}, 'ok', ${candidate.url}, ${candidate.width}, ${candidate.height},
        ${candidate.fileTitle}, ${candidate.articleTitle},
        ${`https://en.wikipedia.org/wiki/${encodeURIComponent(candidate.articleTitle.replace(/ /g, '_'))}`},
        ${credit?.artist ?? null}, ${credit?.license ?? null}, ${candidate.distanceKm}, now()
      )
      ON CONFLICT (place_id) DO UPDATE SET
        status = 'ok', url = EXCLUDED.url, width = EXCLUDED.width, height = EXCLUDED.height,
        file_title = EXCLUDED.file_title, article_title = EXCLUDED.article_title,
        article_url = EXCLUDED.article_url, artist = EXCLUDED.artist,
        license = EXCLUDED.license, distance_km = EXCLUDED.distance_km, resolved_at = now()
    `
  }

  if (misses.length > 0) {
    await sql`
      INSERT INTO place_photos (place_id, status, resolved_at)
      SELECT unnest(${misses}::text[]), 'none', now()
      ON CONFLICT (place_id) DO UPDATE SET status = 'none', resolved_at = now()
    `
  }

  return found.length
}

/*
 * Background top-up.
 *
 * A request attaches whatever is already cached and returns immediately, then
 * resolves a small number of the missing ones so the cache fills as people
 * browse. Bounded per call, and skipped entirely while a run is in flight, so a
 * burst of traffic can't start dozens of overlapping serial loops.
 */
const BACKGROUND_BATCH = 6
let backgroundRunning = false

export function topUpInBackground(subjects: Subject[]): void {
  if (backgroundRunning || subjects.length === 0) return
  backgroundRunning = true

  void (async () => {
    try {
      const pending = await unresolvedIds(subjects)
      if (pending.length === 0) return
      const wanted = new Set(pending.slice(0, BACKGROUND_BATCH))
      await resolvePhotos(subjects.filter((subject) => wanted.has(subject.id)))
    } catch (error) {
      console.error('photo top-up failed:', error)
    } finally {
      backgroundRunning = false
    }
  })()
}

/**
 * Attaches cached photos to places and quietly starts filling the gaps.
 *
 * Also drops the raw OSM tag bag on the way out. It is kept in the database so a
 * new field never requires refetching from an upstream the server cannot reach,
 * but it is server-side working data — shipping a few dozen tags for each of
 * several hundred places would multiply the response size for something no
 * client reads.
 */
export async function withPhotos<T extends Subject & { tags?: unknown }>(
  places: T[],
): Promise<(Omit<T, 'tags'> & { photo: Photo | null })[]> {
  let cached = new Map<string, Photo>()
  try {
    cached = await getCachedPhotos(places.map((place) => place.id))
    topUpInBackground(places)
  } catch (error) {
    // A photo is decoration; failing to attach one must never fail the request.
    console.error('photo lookup failed:', error)
  }
  return places.map((place) => {
    const { tags: _unused, ...rest } = place
    return { ...rest, photo: cached.get(place.id) ?? null }
  })
}
