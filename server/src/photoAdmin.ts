/*
 * Driving the photo warm from the server rather than from a laptop.
 *
 * The warm script needs two things at once: the database on port 5432, and
 * Wikipedia on 443. A developer machine does not reliably get both — this
 * project's own network started refusing outbound 5432 partway through a run,
 * which killed the warm with every Neon address timing out while HTTPS to the
 * same host stayed open. The deployed service has both, so warming belongs there
 * and is driven over HTTPS from wherever.
 *
 * Bounded per call and driven in a loop by the caller, because Wikimedia's rate
 * limit puts a full pass at hours — far past any HTTP timeout — and a fire-and-
 * forget background job would give no way to see progress or failure.
 */

import { Hono } from 'hono'
import { sql } from './db.ts'
import { resolvePhotos } from './photos.ts'

/**
 * Shared secret, required on every route here.
 *
 * Absent means the routes refuse everything rather than defaulting to open: these
 * endpoints spend a rate-limited third-party budget and write to the database, so
 * an unset variable must fail closed.
 */
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? ''

/** Kept well inside a proxy's request timeout at ~1.1s per place. */
const MAX_BATCH = 40

interface Row {
  id: string
  name: string
  lat: number
  lon: number
  category: string
}

export const photoAdmin = new Hono()

photoAdmin.use('*', async (c, next) => {
  if (!ADMIN_TOKEN) return c.json({ error: 'Admin routes are disabled.' }, 404)
  if (c.req.header('authorization') !== `Bearer ${ADMIN_TOKEN}`) {
    return c.json({ error: 'Unauthorized.' }, 401)
  }
  await next()
})

async function stats() {
  const [settled] = await sql<{ ok: number; none: number }[]>`
    SELECT
      count(*) FILTER (WHERE status = 'ok')::int   AS ok,
      count(*) FILTER (WHERE status = 'none')::int AS none
    FROM place_photos
  `
  const [pending] = await sql<{ remaining: number }[]>`
    SELECT count(*)::int AS remaining
    FROM places p
    LEFT JOIN place_photos ph ON ph.place_id = p.id
    WHERE ph.place_id IS NULL
  `
  return { withPhoto: settled.ok, withoutPhoto: settled.none, remaining: pending.remaining }
}

photoAdmin.get('/photos/stats', async (c) => c.json(await stats()))

/*
 * Resolves one batch, newest-value-first: the categories that actually yield
 * photos go before food, which measures near zero. An interrupted sequence of
 * calls therefore still delivers most of the available photos.
 */
photoAdmin.post('/photos/warm', async (c) => {
  const asked = Number(c.req.query('limit') ?? 25)
  const limit = Number.isFinite(asked) ? Math.min(Math.max(Math.floor(asked), 1), MAX_BATCH) : 25

  const rows = await sql<Row[]>`
    SELECT p.id, p.name, p.lat, p.lon, p.category
    FROM places p
    LEFT JOIN place_photos ph ON ph.place_id = p.id
    WHERE ph.place_id IS NULL
    ORDER BY
      CASE p.category
        WHEN 'outdoors' THEN 0 WHEN 'culture'  THEN 1 WHEN 'fun'      THEN 2
        WHEN 'water'    THEN 3 WHEN 'creative' THEN 4 WHEN 'wellness' THEN 5
        ELSE 6
      END,
      p.name
    LIMIT ${limit}
  `

  if (rows.length === 0) return c.json({ done: true, attempted: 0, found: 0, ...(await stats()) })

  const found = await resolvePhotos(rows)
  return c.json({
    done: false,
    attempted: rows.length,
    found,
    categories: [...new Set(rows.map((row) => row.category))],
    ...(await stats()),
  })
})
