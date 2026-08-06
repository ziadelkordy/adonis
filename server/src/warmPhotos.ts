/*
 * Resolves photos for cached places, ahead of anyone browsing them.
 *
 * Wikimedia rate-limits anonymous callers hard, so resolution runs at roughly one
 * place per second and can never happen inline in a request. The server tops up a
 * handful per browse in the background; this fills the rest in bulk.
 *
 *   pnpm warm:photos              # every unresolved place, biggest-draw first
 *   pnpm warm:photos 200          # cap the run
 *
 * Safe to re-run and safe to interrupt: each place is written as it resolves, and
 * places already settled are skipped, so a second run picks up where the first
 * stopped rather than starting over.
 */

import { sql } from './db.ts'
import { resolvePhotos } from './photos.ts'

interface Row {
  id: string
  name: string
  lat: number
  lon: number
  category: string
}

const limitArg = Number(process.argv[2])
const limit = Number.isFinite(limitArg) && limitArg > 0 ? Math.floor(limitArg) : 100_000

/*
 * Ordered by how likely a photo is to exist and be seen. Escape-ish categories
 * (outdoors, culture, fun, water) resolve at roughly 28%; food is close to 0%
 * because suburban restaurants have no Wikipedia article. Running the productive
 * categories first means an interrupted run still delivers most of the photos.
 */
const rows = await sql<Row[]>`
  SELECT p.id, p.name, p.lat, p.lon, p.category
  FROM places p
  LEFT JOIN place_photos ph ON ph.place_id = p.id
  WHERE ph.place_id IS NULL
  ORDER BY
    CASE p.category
      WHEN 'outdoors' THEN 0 WHEN 'culture' THEN 1 WHEN 'fun'     THEN 2
      WHEN 'water'    THEN 3 WHEN 'creative' THEN 4 WHEN 'wellness' THEN 5
      ELSE 6
    END,
    p.name
  LIMIT ${limit}
`

if (rows.length === 0) {
  console.log('Nothing to do — every cached place has already been looked up.')
  await sql.end()
  process.exit(0)
}

const estimate = Math.round((rows.length * 1.15) / 60)
console.log(`Resolving photos for ${rows.length} places (~${estimate} min at Wikimedia's rate).`)
console.log('Most will find nothing; that is expected and gets cached so it is asked only once.\n')

const CHUNK = 25
let found = 0

/*
 * A full run takes hours, and the database sleeps when idle — a managed Postgres
 * that auto-suspends will drop or refuse a connection at some point across that
 * span. An earlier run died outright on a single CONNECT_TIMEOUT six per cent in.
 * Waking the instance takes a few seconds, so a short backoff clears it; only a
 * chunk that fails repeatedly is skipped, and it is left unrecorded so the next
 * run picks it up again.
 */
async function resolveWithRetry(chunk: Row[]): Promise<number> {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await resolvePhotos(chunk)
    } catch (error) {
      if (attempt === 4) {
        console.warn(`  ! skipping ${chunk.length} places after 4 attempts:`, error)
        return 0
      }
      const waitMs = 2000 * attempt
      console.warn(`  … database unavailable, retrying in ${waitMs / 1000}s`)
      await new Promise((resolve) => setTimeout(resolve, waitMs))
    }
  }
  return 0
}

for (let index = 0; index < rows.length; index += CHUNK) {
  found += await resolveWithRetry(rows.slice(index, index + CHUNK))

  const done = Math.min(index + CHUNK, rows.length)
  const pct = Math.round((done / rows.length) * 100)
  console.log(`  ${done}/${rows.length} (${pct}%) — ${found} photos found so far`)
}

const [stats] = await sql<{ ok: string; none: string }[]>`
  SELECT
    count(*) FILTER (WHERE status = 'ok')::text   AS ok,
    count(*) FILTER (WHERE status = 'none')::text AS none
  FROM place_photos
`
console.log(`\nDone. ${stats.ok} places with a photo, ${stats.none} confirmed without.`)

await sql.end()
