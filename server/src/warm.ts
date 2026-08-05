import { fetchEscapes, fetchNearby, reverseGeocode, CATEGORIES } from './places.ts'
import { sql } from './db.ts'

/*
 * Pre-loads places for named areas into the database.
 *
 * Why this exists: the hosting provider cannot reach any public Overpass endpoint
 * — every one refuses or times out from its IP range, while Nominatim from the
 * same container works fine. So the deployed app can only serve areas that are
 * already cached. This script runs somewhere that *can* reach Overpass (a laptop)
 * and fills the shared database.
 *
 * Caching the whole world is not an option: ~305 bytes per place measured, against
 * 100M+ relevant OSM features, is roughly 150 GB. Caching the dozen places you and
 * your friends actually live is ~0.07 GB and takes minutes.
 *
 *   pnpm --filter @adonis/server warm                    # the built-in list
 *   pnpm --filter @adonis/server warm 51.5074 -0.1278 London
 */

interface Area {
  name: string
  lat: number
  lon: number
}

/**
 * The areas this deployment actually serves. Pass coordinates on the command line
 * for anywhere else — and add it here so the set is reproducible from scratch.
 */
const DEFAULT_AREAS: Area[] = [
  // Bay Area — where the people using this live.
  { name: 'Milpitas', lat: 37.4323, lon: -121.8996 },
  { name: 'San Jose', lat: 37.3382, lon: -121.8863 },
  { name: 'Santa Clara', lat: 37.3541, lon: -121.9552 },
  { name: 'Sunnyvale', lat: 37.3688, lon: -122.0363 },
  { name: 'Mountain View', lat: 37.3861, lon: -122.0839 },
  { name: 'Palo Alto', lat: 37.4419, lon: -122.143 },
  { name: 'Fremont', lat: 37.5485, lon: -121.9886 },
  { name: 'San Francisco', lat: 37.7749, lon: -122.4194 },
  { name: 'SF Mission', lat: 37.7599, lon: -122.4148 },
  { name: 'Oakland', lat: 37.8044, lon: -122.2712 },
  { name: 'Berkeley', lat: 37.8715, lon: -122.273 },

  // Los Angeles — warmed earlier.
  { name: 'Santa Monica', lat: 34.0195, lon: -118.4912 },
  { name: 'Downtown LA', lat: 34.0522, lon: -118.2437 },
  { name: 'Venice Beach', lat: 33.985, lon: -118.4695 },
  { name: 'Pasadena', lat: 34.1478, lon: -118.1445 },
  { name: 'Long Beach', lat: 33.7701, lon: -118.1937 },
]

/** The radii the app itself requests, so a warmed area is genuinely ready. */
const NEARBY_RADII = [1000, 2000, 5000, 10_000]
const ESCAPE_RADII = [15_000, 25_000, 40_000]

async function warmArea(area: Area): Promise<void> {
  console.log(`\n${area.name} (${area.lat}, ${area.lon})`)

  try {
    const place = await reverseGeocode(area.lat, area.lon)
    if (place) console.log(`  resolves to: ${place.label}`)
  } catch {
    console.log('  (could not name this location)')
  }

  for (const radius of NEARBY_RADII) {
    const started = Date.now()
    try {
      const { places, cached } = await fetchNearby(area.lat, area.lon, radius, [...CATEGORIES])
      const seconds = ((Date.now() - started) / 1000).toFixed(1)
      console.log(
        `  nearby ${String(radius / 1000).padStart(2)}km: ${String(places.length).padStart(4)} places` +
          `${cached ? ' (already cached)' : ''} in ${seconds}s`,
      )
    } catch (error) {
      console.log(`  nearby ${radius / 1000}km: FAILED — ${(error as Error).message}`)
    }
  }

  for (const radius of ESCAPE_RADII) {
    const started = Date.now()
    try {
      const { places, cached } = await fetchEscapes(area.lat, area.lon, radius)
      const seconds = ((Date.now() - started) / 1000).toFixed(1)
      console.log(
        `  escapes ${String(radius / 1000).padStart(2)}km: ${String(places.length).padStart(4)} places` +
          `${cached ? ' (already cached)' : ''} in ${seconds}s`,
      )
    } catch (error) {
      console.log(`  escapes ${radius / 1000}km: FAILED — ${(error as Error).message}`)
    }
  }
}

function parseArgs(): Area[] {
  const [lat, lon, ...rest] = process.argv.slice(2)
  if (!lat || !lon) return DEFAULT_AREAS

  const parsedLat = Number(lat)
  const parsedLon = Number(lon)
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLon)) {
    console.error('Usage: warm [lat lon [name]]')
    process.exit(1)
  }

  return [{ name: rest.join(' ') || `${parsedLat}, ${parsedLon}`, lat: parsedLat, lon: parsedLon }]
}

const areas = parseArgs()
console.log(`Warming ${areas.length} area(s) into the database.`)
console.log('Run this from a machine that can reach Overpass — the deployed one cannot.')

for (const area of areas) {
  await warmArea(area)
}

const [{ count, size }] = await sql<{ count: string; size: string }[]>`
  SELECT count(*)::text AS count, pg_size_pretty(pg_total_relation_size('places')) AS size
  FROM places
`
console.log(`\nDone. ${count} places cached, using ${size}.`)

await sql.end()
