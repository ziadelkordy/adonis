import { serve } from '@hono/node-server'
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
import { fetchEventsBundle, isEventsConfigured } from './events.ts'
import {
  CATEGORIES,
  type Category,
  UpstreamError,
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

app.get('/api/health', async (c) => {
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

app.post('/api/auth/signup', async (c) => {
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
  // Return the cached place records too, so the client can render saved places
  // it hasn't otherwise loaded (e.g. straight after signing in).
  return c.json({ ids, places: await loadPlaces(ids) })
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

  const rows = await sql<{ id: string; place_id: string; start_min: number }[]>`
    SELECT id, place_id, start_min
    FROM scheduled_items
    WHERE user_id = ${user.id} AND day = ${day}
    ORDER BY start_min
  `

  const places = await loadPlaces(rows.map((row) => row.place_id))

  return c.json({
    day,
    items: rows.map((row) => ({ id: row.id, placeId: row.place_id, startMin: row.start_min })),
    places,
  })
})

dayApp.post('/', async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => null)
  const { placeId, startMin, day: rawDay } = (body ?? {}) as Record<string, unknown>

  const day = parseDay(typeof rawDay === 'string' ? rawDay : undefined)
  if (!day) return c.json({ error: 'Invalid day, expected YYYY-MM-DD.' }, 400)

  if (typeof placeId !== 'string' || !placeId) {
    return c.json({ error: 'placeId is required.' }, 400)
  }
  if (typeof startMin !== 'number' || !Number.isInteger(startMin) || startMin < 0 || startMin > 1439) {
    return c.json({ error: 'startMin must be an integer between 0 and 1439.' }, 400)
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
    return c.json({ places, cached, radiusM, count: places.length })
  } catch (error) {
    if (error instanceof UpstreamError) {
      // 503, not 500: OpenStreetMap is unavailable, our service is fine.
      return c.json({ error: `OpenStreetMap is unavailable right now (${error.message}).` }, 503)
    }
    console.error('nearby failed:', error)
    return c.json({ error: 'Could not load nearby places.' }, 500)
  }
})

app.get('/api/events/nearby', async (c) => {
  const lat = parseCoord(c.req.query('lat'), 90)
  const lon = parseCoord(c.req.query('lon'), 180)
  if (lat === null || lon === null) {
    return c.json({ error: 'lat and lon are required and must be valid coordinates.' }, 400)
  }

  const requested = Number(c.req.query('radius') ?? 25_000)
  const radiusM = Number.isFinite(requested)
    ? Math.min(Math.max(requested, 1000), 200_000)
    : 25_000

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
  console.log(`Sundial API listening on http://localhost:${info.port}`)
  console.log(
    isEventsConfigured()
      ? 'Events: sports from ESPN + ticketed listings from Ticketmaster.'
      : 'Events: sports from ESPN (no key needed). Set TICKETMASTER_API_KEY to add comedy, music and theatre.',
  )
})
