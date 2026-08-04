/*
 * Sports fixtures — football, baseball, basketball, hockey, soccer — from ESPN's
 * public site API.
 *
 * Why this source: it needs no key and returns complete slates (a full 15-game
 * MLB day, 185 college football games over two weeks), where every keyed
 * alternative is gated and the free tiers are throttled to a handful of results.
 *
 * Caveat worth knowing: this endpoint is undocumented. It is widely used and
 * stable in practice, but it is not a sanctioned public API, so it could change
 * or start refusing traffic without notice. Everything here degrades to "no
 * sports events" rather than failing the request when that happens.
 */

export interface EspnFixture {
  id: string
  name: string
  /** ISO instant, e.g. "2026-08-05T18:10Z". */
  startsAt: string
  venueName: string | null
  city: string | null
  region: string | null
  /** Broad kind, always "Sports" here, matching the Ticketmaster vocabulary. */
  segment: string
  /** e.g. "American Football" — what the Football / Sports filters match on. */
  genre: string
  league: string
  url: string | null
}

interface League {
  /** ESPN path, e.g. "football/nfl". */
  path: string
  label: string
  /** Deliberately shares Ticketmaster's genre wording so filters work on both. */
  genre: string
}

const LEAGUES: League[] = [
  { path: 'football/nfl', label: 'NFL', genre: 'American Football' },
  { path: 'football/college-football', label: 'College Football', genre: 'American Football' },
  { path: 'basketball/nba', label: 'NBA', genre: 'Basketball' },
  { path: 'basketball/wnba', label: 'WNBA', genre: 'Basketball' },
  { path: 'basketball/mens-college-basketball', label: 'College Basketball', genre: 'Basketball' },
  { path: 'baseball/mlb', label: 'MLB', genre: 'Baseball' },
  { path: 'hockey/nhl', label: 'NHL', genre: 'Hockey' },
  { path: 'soccer/usa.1', label: 'MLS', genre: 'Soccer' },
  { path: 'soccer/eng.1', label: 'Premier League', genre: 'Soccer' },
]

const BASE = 'https://site.api.espn.com/apis/site/v2/sports'

function yyyymmdd(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '')
}

interface RawEvent {
  id?: unknown
  name?: unknown
  shortName?: unknown
  date?: unknown
  links?: Array<{ href?: unknown; rel?: unknown[] }>
  competitions?: Array<{
    venue?: {
      fullName?: unknown
      address?: { city?: unknown; state?: unknown; country?: unknown }
    }
  }>
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalize(raw: RawEvent, league: League): EspnFixture | null {
  const id = str(raw.id)
  const name = str(raw.name) ?? str(raw.shortName)
  const date = str(raw.date)
  if (!id || !name || !date) return null

  // ESPN sends "2026-08-05T18:10Z" — valid ISO, but confirm before trusting it.
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return null

  const venue = raw.competitions?.[0]?.venue
  const address = venue?.address

  const desktopLink = raw.links?.find((link) =>
    Array.isArray(link.rel) ? link.rel.includes('desktop') : false,
  )

  return {
    id: `espn:${league.path}:${id}`,
    name,
    startsAt: parsed.toISOString(),
    venueName: str(venue?.fullName),
    city: str(address?.city),
    region: str(address?.state),
    segment: 'Sports',
    genre: league.genre,
    league: league.label,
    url: str(desktopLink?.href) ?? null,
  }
}

async function fetchLeague(league: League, from: Date, to: Date): Promise<EspnFixture[]> {
  const url = `${BASE}/${league.path}/scoreboard?dates=${yyyymmdd(from)}-${yyyymmdd(to)}&limit=400`

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) return []

    const payload = (await response.json()) as { events?: RawEvent[] }
    return (payload.events ?? [])
      .map((raw) => normalize(raw, league))
      .filter((fixture): fixture is EspnFixture => fixture !== null)
  } catch {
    // One league failing shouldn't lose the others.
    return []
  }
}

/** Fixtures starting within the next `days`, across all configured leagues. */
export async function fetchFixtures(days = 21): Promise<EspnFixture[]> {
  const now = new Date()
  const to = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)

  const results = await Promise.all(LEAGUES.map((league) => fetchLeague(league, now, to)))

  const byId = new Map<string, EspnFixture>()
  for (const fixture of results.flat()) {
    // Already-started games are noise for planning a day out.
    if (new Date(fixture.startsAt).getTime() < now.getTime() - 60 * 60 * 1000) continue
    byId.set(fixture.id, fixture)
  }

  return [...byId.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}

export const ESPN_LEAGUE_COUNT = LEAGUES.length
