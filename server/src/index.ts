import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { type Context, Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  type SessionUser,
  createSession,
  destroySession,
  findSessionUser,
  hashPassword,
  pruneExpiredSessions,
  verifyPassword,
} from './auth.ts'
import { assertDatabaseReachable, sql } from './db.ts'
import { withPhotos } from './photos.ts'
import { checkRateLimit } from './rateLimit.ts'
import { loadEvents, parseEventSnapshot, upsertEvent } from './schedule.ts'
import { fetchEventsBundle, isEventsConfigured } from './events.ts'
import {
  CATEGORIES,
  type Category,
  ESCAPE_MAX_RADIUS_M,
  UpstreamError,
  fetchEscapes,
  fetchNearby,
  loadPlaces,
  reverseGeocode,
} from './places.ts'

const PORT = Number(process.env.PORT ?? 8787)
const IS_PROD = process.env.NODE_ENV === 'production'

type Env = { Variables: { user: SessionUser } }

const app = new Hono()

/* -------------------------------------------------------------------------- */
/* Validation helpers                                                          */
/* -------------------------------------------------------------------------- */

function parseCoord(value: unknown, max: number): number | null {
  const num = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN
  if (!Number.isFinite(num) || Math.abs(num) > max) return null
  return num
}

function parseCategories(raw: string | undefined): Category[] {
  if (!raw) return [...CATEGORIES]
  const wanted = new Set(raw.split(',').map((part) => part.trim()))
  const picked = CATEGORIES.filter((category) => wanted.has(category))
  return picked.length > 0 ? picked : [...CATEGORIES]
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/** YYYY-MM-DD only — the value reaches a SQL `date` column. */
function parseDay(raw: string | undefined): string | null {
  if (!raw) return todayISO()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  return Number.isNaN(new Date(`${raw}T00:00:00Z`).getTime()) ? null : raw
}

/* -------------------------------------------------------------------------- */
/* Health                                                                      */
/* -------------------------------------------------------------------------- */

/*
 * Liveness only — deliberately does NOT touch the database.
 *
 * This is the platform's health check, and it previously ran `SELECT 1`. Managed
 * Postgres on a free plan auto-suspends when idle and takes a moment to wake, so
 * a slow or failed wake made this endpoint fail, the platform marked the instance
 * unhealthy, and pulled it out of rotation — every request then answered from the
 * edge with `x-render-routing: no-server`, a 404 that never reached the app at
 * all. Measured at 19 failures in 25 requests.
 *
 * A liveness probe answers "is this process up", nothing more. Readiness of a
 * dependency belongs on its own endpoint, below.
 */
app.get('/api/health', (c) => c.json({ ok: true }))

/** Database reachability, for humans and monitoring — never the platform probe. */
app.get('/api/health/db', async (c) => {
  try {
    await assertDatabaseReachable()
    return c.json({ ok: true, db: 'up' })
  } catch (error) {
    return c.json({ ok: false, db: 'down', error: String(error) }, 503)
  }
})

/* -------------------------------------------------------------------------- */
/* Auth                                                                        */
/* -------------------------------------------------------------------------- */

function issueSession(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    // Secure would prevent the cookie working over plain http on localhost.
    secure: IS_PROD,
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
}

/*
 * Credential endpoints are rate limited per IP. Login is the one worth attacking,
 * and scrypt verification is intentionally slow, so a flood costs CPU as well as
 * risking a guessed password.
 */
const AUTH_LIMITS = { limit: 10, windowMs: 10 * 60 * 1000 }

function tooManyAttempts(c: Context, name: string) {
  const result = checkRateLimit(c, { name, ...AUTH_LIMITS })
  if (result.ok) return null
  return c.json(
    { error: `Too many attempts. Try again in ${result.retryAfterSeconds} seconds.` },
    429,
    { 'Retry-After': String(result.retryAfterSeconds) },
  )
}

app.post('/api/auth/signup', async (c) => {
  const limited = tooManyAttempts(c, 'signup')
  if (limited) return limited

  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json({ error: 'Invalid request body.' }, 400)

  const { email, password, displayName } = body as Record<string, unknown>

  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return c.json({ error: 'Enter a valid email address.' }, 400)
  }
  if (typeof password !== 'string' || password.length < 8) {
    return c.json({ error: 'Password must be at least 8 characters.' }, 400)
  }
  const name =
    typeof displayName === 'string' && displayName.trim() ? displayName.trim() : email.split('@')[0]

  const existing = await sql`SELECT 1 FROM users WHERE lower(email) = ${email.trim().toLowerCase()}`
  if (existing.length > 0) {
    return c.json({ error: 'That email is already registered.' }, 409)
  }

  const passwordHash = await hashPassword(password)
  const rows = await sql<{ id: string; email: string; display_name: string }[]>`
    INSERT INTO users (email, display_name, password_hash)
    VALUES (${email.trim()}, ${name}, ${passwordHash})
    RETURNING id, email, display_name
  `

  const user = rows[0]
  const { token } = await createSession(user.id)
  issueSession(c, token)

  return c.json({ user: { id: user.id, email: user.email, displayName: user.display_name } }, 201)
})

app.post('/api/auth/login', async (c) => {
  const limited = tooManyAttempts(c, 'login')
  if (limited) return limited

  const body = await c.req.json().catch(() => null)
  const { email, password } = (body ?? {}) as Record<string, unknown>

  if (typeof email !== 'string' || typeof password !== 'string') {
    return c.json({ error: 'Email and password are required.' }, 400)
  }

  const rows = await sql<
    { id: string; email: string; display_name: string; password_hash: string }[]
  >`
    SELECT id, email, display_name, password_hash
    FROM users WHERE lower(email) = ${email.trim().toLowerCase()}
  `

  const row = rows[0]
  // Same message either way, so this can't be used to enumerate accounts.
  const invalid = () => c.json({ error: 'Email or password is incorrect.' }, 401)

  if (!row) return invalid()
  if (!(await verifyPassword(password, row.password_hash))) return invalid()

  const { token } = await createSession(row.id)
  issueSession(c, token)

  return c.json({ user: { id: row.id, email: row.email, displayName: row.display_name } })
})

app.post('/api/auth/logout', async (c) => {
  await destroySession(getCookie(c, SESSION_COOKIE))
  setCookie(c, SESSION_COOKIE, '', { path: '/', maxAge: 0 })
  return c.json({ ok: true })
})

app.get('/api/auth/me', async (c) => {
  const user = await findSessionUser(getCookie(c, SESSION_COOKIE))
  return user ? c.json({ user }) : c.json({ user: null })
})

/* -------------------------------------------------------------------------- */
/* Authenticated routes                                                        */
/* -------------------------------------------------------------------------- */

/*
 * Auth middleware is attached to two narrowly-mounted sub-apps rather than one
 * app mounted at /api. A `use('*')` on an /api-mounted app guards every /api
 * route — including the public places endpoints — and whether it does so depends
 * on registration order, which is far too easy to break by adding a route later.
 */
const requireUser = async (
  c: Context<Env>,
  next: () => Promise<void>,
): Promise<Response | void> => {
  const user = await findSessionUser(getCookie(c, SESSION_COOKIE))
  if (!user) return c.json({ error: 'Not signed in.' }, 401)
  c.set('user', user)
  await next()
}

/* Saved items ------------------------------------------------------------- */

/*
 * Item ids are OSM identities like "way/12345" — the slash makes them unusable
 * as path parameters, so they travel in the body or query string instead.
 */
const savedApp = new Hono<Env>()
savedApp.use('*', requireUser)

savedApp.get('/', async (c) => {
  const user = c.get('user')
  const rows = await sql<{ item_id: string }[]>`
    SELECT item_id FROM saved_items WHERE user_id = ${user.id} ORDER BY saved_at DESC
  `
  const ids = rows.map((row) => row.item_id)
  // Return the cached records too, so the client can render saved items it hasn't
  // otherwise loaded (e.g. straight after signing in).
  const [places, events] = await Promise.all([loadPlaces(ids), loadEvents(ids)])
  return c.json({ ids, places, events })
})

savedApp.put('/', async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => null)
  const { itemId } = (body ?? {}) as Record<string, unknown>

  if (typeof itemId !== 'string' || !itemId.trim()) {
    return c.json({ error: 'itemId is required.' }, 400)
  }

  await sql`
    INSERT INTO saved_items (user_id, item_id) VALUES (${user.id}, ${itemId})
    ON CONFLICT (user_id, item_id) DO NOTHING
  `
  return c.json({ ok: true, saved: true })
})

savedApp.delete('/', async (c) => {
  const user = c.get('user')
  const itemId = c.req.query('itemId')

  if (!itemId) return c.json({ error: 'itemId is required.' }, 400)

  await sql`DELETE FROM saved_items WHERE user_id = ${user.id} AND item_id = ${itemId}`
  return c.json({ ok: true, saved: false })
})

app.route('/api/saved', savedApp)

/* The day ---------------------------------------------------------------- */

const dayApp = new Hono<Env>()
dayApp.use('*', requireUser)

dayApp.get('/', async (c) => {
  const user = c.get('user')
  const day = parseDay(c.req.query('day'))
  if (!day) return c.json({ error: 'Invalid day, expected YYYY-MM-DD.' }, 400)

  const rows = await sql<
    { id: string; place_id: string | null; event_id: string | null; start_min: number }[]
  >`
    SELECT id, place_id, event_id, start_min
    FROM scheduled_items
    WHERE user_id = ${user.id} AND day = ${day}
    ORDER BY start_min
  `

  const [places, events] = await Promise.all([
    loadPlaces(rows.flatMap((row) => (row.place_id ? [row.place_id] : []))),
    loadEvents(rows.flatMap((row) => (row.event_id ? [row.event_id] : []))),
  ])

  return c.json({
    day,
    items: rows.map((row) => ({
      id: row.id,
      placeId: row.place_id,
      eventId: row.event_id,
      startMin: row.start_min,
    })),
    places,
    events,
  })
})

dayApp.post('/', async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => null)
  const { placeId, startMin, day: rawDay, event } = (body ?? {}) as Record<string, unknown>

  const day = parseDay(typeof rawDay === 'string' ? rawDay : undefined)
  if (!day) return c.json({ error: 'Invalid day, expected YYYY-MM-DD.' }, 400)

  if (typeof startMin !== 'number' || !Number.isInteger(startMin) || startMin < 0 || startMin > 1439) {
    return c.json({ error: 'startMin must be an integer between 0 and 1439.' }, 400)
  }

  /* An event: store the snapshot first so the foreign key resolves, and so the
     plan survives the provider dropping the listing. */
  if (event !== undefined) {
    const snapshot = parseEventSnapshot(event)
    if (!snapshot) return c.json({ error: 'That event is missing required details.' }, 400)

    await upsertEvent(snapshot)

    const rows = await sql<{ id: string }[]>`
      INSERT INTO scheduled_items (user_id, event_id, day, start_min)
      VALUES (${user.id}, ${snapshot.id}, ${day}, ${startMin})
      ON CONFLICT (user_id, day, event_id, start_min) WHERE event_id IS NOT NULL DO NOTHING
      RETURNING id
    `
    if (rows.length === 0) {
      return c.json({ error: 'That event is already on your day at that time.' }, 409)
    }
    return c.json({ id: rows[0].id, eventId: snapshot.id, startMin, day }, 201)
  }

  if (typeof placeId !== 'string' || !placeId) {
    return c.json({ error: 'placeId or event is required.' }, 400)
  }

  // scheduled_items.place_id is a foreign key, so the place must be cached first.
  const known = await sql`SELECT 1 FROM places WHERE id = ${placeId}`
  if (known.length === 0) {
    return c.json({ error: 'Unknown place. Load it from /api/places/nearby first.' }, 400)
  }

  const rows = await sql<{ id: string }[]>`
    INSERT INTO scheduled_items (user_id, place_id, day, start_min)
    VALUES (${user.id}, ${placeId}, ${day}, ${startMin})
    ON CONFLICT (user_id, day, place_id, start_min) DO NOTHING
    RETURNING id
  `

  if (rows.length === 0) {
    return c.json({ error: 'That place is already scheduled at that time.' }, 409)
  }
  return c.json({ id: rows[0].id, placeId, startMin, day }, 201)
})

dayApp.patch('/:id', async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => null)
  const { startMin } = (body ?? {}) as Record<string, unknown>

  if (typeof startMin !== 'number' || !Number.isInteger(startMin) || startMin < 0 || startMin > 1439) {
    return c.json({ error: 'startMin must be an integer between 0 and 1439.' }, 400)
  }

  const rows = await sql<{ id: string }[]>`
    UPDATE scheduled_items SET start_min = ${startMin}
    WHERE id = ${c.req.param('id')} AND user_id = ${user.id}
    RETURNING id
  `
  if (rows.length === 0) return c.json({ error: 'Not found.' }, 404)
  return c.json({ ok: true })
})

dayApp.delete('/:id', async (c) => {
  const user = c.get('user')
  const rows = await sql<{ id: string }[]>`
    DELETE FROM scheduled_items
    WHERE id = ${c.req.param('id')} AND user_id = ${user.id}
    RETURNING id
  `
  if (rows.length === 0) return c.json({ error: 'Not found.' }, 404)
  return c.json({ ok: true })
})

dayApp.delete('/', async (c) => {
  const user = c.get('user')
  const day = parseDay(c.req.query('day'))
  if (!day) return c.json({ error: 'Invalid day, expected YYYY-MM-DD.' }, 400)

  await sql`DELETE FROM scheduled_items WHERE user_id = ${user.id} AND day = ${day}`
  return c.json({ ok: true })
})

app.route('/api/day', dayApp)

/* -------------------------------------------------------------------------- */
/* Places — public, since browsing doesn't require an account                   */
/* -------------------------------------------------------------------------- */

app.get('/api/places/nearby', async (c) => {
  const lat = parseCoord(c.req.query('lat'), 90)
  const lon = parseCoord(c.req.query('lon'), 180)
  if (lat === null || lon === null) {
    return c.json({ error: 'lat and lon are required and must be valid coordinates.' }, 400)
  }

  const requested = Number(c.req.query('radius') ?? 3000)
  const radiusM = Number.isFinite(requested) ? Math.min(Math.max(requested, 250), 20_000) : 3000
  const categories = parseCategories(c.req.query('categories'))

  try {
    const { places, cached } = await fetchNearby(lat, lon, radiusM, categories)
    return c.json({ places: await withPhotos(places), cached, radiusM, count: places.length })
  } catch (error) {
    if (error instanceof UpstreamError) {
      // 503, not 500: OpenStreetMap is unavailable, our service is fine.
      return c.json({ error: `OpenStreetMap is unavailable right now (${error.message}).` }, 503)
    }
    console.error('nearby failed:', error)
    return c.json({ error: 'Could not load nearby places.' }, 500)
  }
})

/*
 * Trip-worthy places further out — beaches, nature reserves, viewpoints, theme
 * parks. Slow on a cold cache (~30s at 40km) because the area is large, then
 * cached for a week like any other place query.
 */
app.get('/api/places/escapes', async (c) => {
  const lat = parseCoord(c.req.query('lat'), 90)
  const lon = parseCoord(c.req.query('lon'), 180)
  if (lat === null || lon === null) {
    return c.json({ error: 'lat and lon are required and must be valid coordinates.' }, 400)
  }

  const requested = Number(c.req.query('radius') ?? ESCAPE_MAX_RADIUS_M)
  const radiusM = Number.isFinite(requested)
    ? Math.min(Math.max(requested, 5000), ESCAPE_MAX_RADIUS_M)
    : ESCAPE_MAX_RADIUS_M

  try {
    const { places, cached } = await fetchEscapes(lat, lon, radiusM)
    return c.json({ places: await withPhotos(places), cached, count: places.length, radiusM })
  } catch (error) {
    if (error instanceof UpstreamError) {
      return c.json({ error: `OpenStreetMap is unavailable right now (${error.message}).` }, 503)
    }
    console.error('escapes failed:', error)
    return c.json({ error: 'Could not load escapes.' }, 500)
  }
})

app.get('/api/events/nearby', async (c) => {
  const lat = parseCoord(c.req.query('lat'), 90)
  const lon = parseCoord(c.req.query('lon'), 180)
  if (lat === null || lon === null) {
    return c.json({ error: 'lat and lon are required and must be valid coordinates.' }, 400)
  }

  // 50km by default: metro venues sit far from the suburbs their audience
  // travels from, and a tighter default returns an empty list that reads as a
  // broken feature rather than a small search.
  const requested = Number(c.req.query('radius') ?? 50_000)
  const radiusM = Number.isFinite(requested)
    ? Math.min(Math.max(requested, 1000), 200_000)
    : 50_000

  try {
    const bundle = await fetchEventsBundle(lat, lon, radiusM)
    return c.json({
      events: bundle.events,
      count: bundle.events.length,
      sources: bundle.sources,
      // Sports need no key; only comedy/music/theatre listings do.
      ticketingConfigured: bundle.ticketingConfigured,
      venuesPending: bundle.venuesPending,
    })
  } catch (error) {
    console.error('events failed:', error)
    return c.json({ error: 'Could not load events.' }, 500)
  }
})

app.get('/api/geo/reverse', async (c) => {
  const lat = parseCoord(c.req.query('lat'), 90)
  const lon = parseCoord(c.req.query('lon'), 180)
  if (lat === null || lon === null) {
    return c.json({ error: 'lat and lon are required and must be valid coordinates.' }, 400)
  }

  try {
    const place = await reverseGeocode(lat, lon)
    return place ? c.json(place) : c.json({ error: 'Could not name that location.' }, 502)
  } catch (error) {
    console.error('reverse geocode failed:', error)
    return c.json({ error: 'Could not name that location.' }, 502)
  }
})

/* -------------------------------------------------------------------------- */
/* Static frontend (production)                                                */
/* -------------------------------------------------------------------------- */

/*
 * In development Vite serves the app and proxies /api here. In production this
 * process serves both, so there's one origin, one deployable and one URL.
 */
const DIST_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist')
const SERVE_STATIC = existsSync(DIST_DIR)

if (SERVE_STATIC) {
  /*
   * serveStatic resolves `root` against process.cwd(), not this file — and the
   * server may be launched from the repo root or from server/ depending on how
   * it's started. A hard-coded './dist' silently missed in the container, and
   * every asset fell through to the SPA handler, which returned index.html with a
   * 200. The browser then got HTML where it expected JavaScript: a blank page,
   * with no error status to point at it.
   */
  const staticRoot = relative(process.cwd(), DIST_DIR) || '.'
  app.use('/assets/*', serveStatic({ root: staticRoot }))
  app.use('/favicon.svg', serveStatic({ root: staticRoot }))

  /*
   * SPA fallback. Client-side routes like /explore/fun and /saved have no file
   * behind them, so they get index.html and the router takes over — otherwise a
   * shared deep link 404s.
   */
  app.get('*', async (c) => {
    const path = c.req.path
    if (path.startsWith('/api/')) return c.json({ error: 'Not found.' }, 404)

    /*
     * Anything with a file extension is a missing asset, not a route. Returning
     * index.html for those is what hid the bug above, so they 404 honestly.
     */
    if (extname(path)) return c.text('Not found', 404)

    try {
      const html = await readFile(join(DIST_DIR, 'index.html'), 'utf8')
      return c.html(html)
    } catch {
      return c.text('Frontend build not found. Run pnpm build.', 500)
    }
  })
}

/* -------------------------------------------------------------------------- */
/* Boot                                                                        */
/* -------------------------------------------------------------------------- */

try {
  await assertDatabaseReachable()
} catch (error) {
  console.error(
    'Cannot reach Postgres. Is it running? Try: docker compose up -d\n',
    error instanceof Error ? error.message : error,
  )
  process.exit(1)
}

await pruneExpiredSessions()

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(
    SERVE_STATIC
      ? `Adonis listening on http://localhost:${info.port} (app + API)`
      : `Adonis API listening on http://localhost:${info.port}`,
  )
  console.log(
    isEventsConfigured()
      ? 'Events: sports from ESPN + ticketed listings from Ticketmaster.'
      : 'Events: sports from ESPN (no key needed). Set TICKETMASTER_API_KEY to add comedy, music and theatre.',
  )
})
