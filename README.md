# Sundial

Plan your day, find things to do, and dream up your next escape. Sunny, beachy,
flowery — yellow leads, pink accents, sea green keeps it from going saccharine.

Nearby places are **real data** from OpenStreetMap, located from your browser.
Your account, your day and your saved places live in a **real Postgres
database** behind a small API.

## Run it

You need Docker running (for Postgres) and Node 22+.

```bash
pnpm setup      # install deps, start Postgres, run migrations
pnpm dev:api    # terminal 1 — API on http://localhost:8787
pnpm dev        # terminal 2 — app on http://localhost:5173
```

Then open the app and create an account. Browsing what's nearby needs no account;
planning a day and saving places do.

Other scripts:

```bash
pnpm db:up / db:down     # start / stop Postgres
pnpm db:migrate          # apply migrations (idempotent)
pnpm db:psql             # psql shell into the database
pnpm type-check          # app + server
pnpm lint                # oxlint
pnpm build               # production build of the app
```

## The four sections

| Section | What it does |
|---|---|
| **Today** | A real time-positioned timeline, 6am to midnight. Nudge activities ±30 min, drop them, and see gaps surfaced as "1h 15m free". Live "now" marker and running totals. Requires an account. |
| **Explore** | Three tabs — see below. No account needed to browse. |
| **Escapes** | Ten curated destinations — nightly rate, flight length, best months, temperature. "Somewhere worth a week of your life" is an editorial judgement, not a map feature, so these stay hand-picked. |
| **Saved** | Everything hearted, split into nearby places and far-away escapes. Requires an account. |

### Explore's three tabs

| Tab | Source | Notes |
|---|---|---|
| **Nearby** | OpenStreetMap | Everything mapped around you, closest first, with category chips showing live counts. |
| **Fun** | OpenStreetMap | The same fetch, narrowed to `fun`, `nightlife`, `creative` and `water` — piers, arcades, bowling, escape rooms, aquariums, bars, studios, beaches. A client-side filter, not a second request, so switching is instant. |
| **Events** | ESPN + Ticketmaster | Real dated listings — football and other sport, comedy, gigs, theatre, family shows — soonest first, filterable by kind, within 25/50/100 km. Sport needs no key. |

Filters reset when you switch tabs: a category chosen under Nearby may not exist
at all within Fun, which would otherwise land you on an unexplained empty grid.

#### Rides are not destinations

In OSM an `attraction=*` tag marks a single ride or feature *inside* a park —
`attraction=roller_coaster`, `big_wheel`, `carousel`, `amusement_ride`. Anything
carrying one is dropped, because listing "West Coaster" and "Pacific Wheel"
next to Pacific Park is noise: you go to the park, not to one ride.

The parent venues are unaffected, which is the point — Pacific Park is
`tourism=theme_park` and Santa Monica Pier is `man_made=pier` +
`tourism=attraction`, and neither carries an `attraction` tag. Small roadside
markers are dropped too (`historic=milestone`, `memorial`, `plaque` and similar),
which is what removed "Historic end of Route 66".

Occasional mis-tagged rides still slip through — a ride tagged only
`tourism=attraction`, with no `attraction=*` at all, is indistinguishable from a
real destination without resorting to a name blocklist.

`NORMALIZER_VERSION` in `places.ts` is part of the cache key: bump it whenever the
tag filters or normalisation change, or already-cached areas keep serving results
shaped by the old rules and the fix appears to do nothing.

#### Event kinds

Ticketmaster splits classification into a broad `segment` (Music / Sports / Arts &
Theatre) and a narrower `genre` (Football, Comedy, Rock), so the filter chips match
on whichever fits: Sports is a segment, Football and Comedy are genres. Chips are
OR-ed and show live counts, and a chip with nothing behind it is hidden rather
than shown as a dead end.

### Where events come from

**OpenStreetMap has no events data** — it maps physical geography, not things
happening at a time — so events use two other providers:

| Provider | Needs a key? | Gives |
|---|---|---|
| **ESPN** site API | No | Football (NFL + college), baseball, basketball (NBA/WNBA/college), hockey, soccer (MLS + Premier League) fixtures with venue and kick-off time |
| **Ticketmaster** Discovery | Free key | Comedy, music, theatre, family shows — plus ticket prices and artwork |

So the tab works out of the box for sport, and a key adds everything else.

Both are searched together and the results merged. Ticketmaster also lists many
fixtures, so the same game can arrive twice; the ticketed copy wins because it
carries prices, matched on date + venue + a loose word overlap (the two word
titles differently — "Dodgers vs. Giants" against "Kansas City Royals at Los
Angeles Dodgers"). Either provider failing still returns the other.

#### Why these two, and what was rejected

Measured, not assumed:

| Source | Outcome |
|---|---|
| **ESPN** site API | **Chosen.** Keyless and complete — a full 15-game MLB day, 185 college football games over a fortnight |
| **Ticketmaster** | **Chosen** for non-sport. Free self-serve key, no card |
| TheSportsDB | Keyless but the public test key caps every response at ~3 results, where an in-season MLB day has 15 |
| SeatGeek | 403 without a client id |
| Bandsintown | 403 — explicit deny without a registered app id |
| Songkick | 401, key required |
| Eventbrite | Public event search removed in Feb 2020 |
| Resident Advisor | GraphQL sits behind Cloudflare |
| OpenEventDatabase | Keyless, but France-only (Los Angeles returns 0, Paris 200) and mostly roadworks and procurement tenders |
| City open data (Socrata/CKAN) | Keyless but per-city, and it is council meetings and permits rather than gigs |
| PredictHQ | Paid |

**Caveat on ESPN:** the endpoint is undocumented. It is widely used and stable in
practice, but it is not a sanctioned public API, so it could change or start
refusing traffic without notice. Everything degrades to "no sports events" rather
than failing the request if that happens.

#### Venue geocoding

Sports schedules give a venue *name* and city but no coordinates, and "near me"
needs coordinates. Venues are geocoded through Nominatim and cached in
`event_venues` — including failures, so an unmappable venue isn't retried forever.

Geocoding never happens on the request path. There are hundreds of venues across
the leagues and a fortnight of fixtures, and at Nominatim's one-per-second limit,
resolving even eight per request added **~9 seconds to every call** while still
mostly resolving stadiums nowhere near the user. So requests read the cache only
(~0.1s) and unresolved venues go to a background worker that drains at a polite
one per second, prioritising the user's own state. The list fills in over the
following minute; the UI says so while it does.

#### Adding the ticketing key

```bash
cp server/.env.example server/.env
# set TICKETMASTER_API_KEY=<your Consumer Key>
pnpm dev:api      # restart; the API loads server/.env automatically
```

Swapping provider (Foursquare, SeatGeek, PredictHQ) means rewriting
`server/src/events.ts` only — the endpoint shape and the entire UI stay as they
are.

Event responses are cached in memory for 10 minutes rather than in Postgres:
listings change through the day and, unlike place data, aren't worth persisting.

`TICKETMASTER_URL` is overridable, which is how the whole path was verified
against a local fixture without a real key — including string-typed coordinates,
`HH:MM:SS` times, listings with no price or venue location, and malformed entries
that must be dropped rather than half-rendered. Provider image URLs that fail to
load fall back to the generated artwork.

## Architecture

```
docker-compose.yml     Postgres 17 on port 5433 (not 5432 — avoids collisions)
server/
  migrations/*.sql     Schema, applied in filename order, individually idempotent
  src/db.ts            postgres.js connection
  src/migrate.ts       Migration runner, records what it has applied
  src/auth.ts          scrypt password hashing + opaque session tokens
  src/places.ts        Overpass + Nominatim, normalisation, Postgres caching
  src/events.ts        Merges both event providers, dedups across them
  src/espn.ts          Keyless sports fixtures
  src/venues.ts        Venue geocoding cache + background warmer
  src/index.ts         Hono routes
  .env.example         Copy to .env for the events key
src/
  lib/api.ts           Typed client for the API
  lib/useGeolocation.ts
  lib/useAppState.ts   All app state; server is the source of truth
  components/          PlaceCard, DestinationCard, AuthPanel, Scene, ui, icons
  views/               Today, Explore, Escapes, Saved
```

The frontend never talks to OpenStreetMap directly. Everything goes through our
API, which lets us set a proper `User-Agent` (browsers can't), throttle Nominatim
to its required 1 req/sec, and cache results.

### Auth

Email plus password. Passwords are hashed with **scrypt** from Node's standard
library — a sound KDF with no native module to build. Sessions are opaque random
tokens stored in Postgres and sent as an `httpOnly` cookie, so they are
revocable server-side and unreadable from JavaScript. Login failures return an
identical message whether the email is unknown or the password is wrong, so the
endpoint can't be used to enumerate accounts.

`secure` is set on the cookie only in production, since it would stop the cookie
working over plain http on localhost.

### What OpenStreetMap does and doesn't give you

This shaped the UI, so it's worth being explicit.

**It has:** names, exact coordinates, categories, `opening_hours`, websites,
phone numbers, cuisine, and sometimes a `fee` tag.

**It has no prices and no ratings.** So there is no price-tier filter and no star
rating anywhere in Explore — inventing them would be worse than omitting them.
What replaced them: real distance from you, category, and a "known free" filter
driven by the `fee` tag where it exists.

**It has no visit durations.** Scheduling needs one, so each category carries a
default (a park is 75 minutes, a museum 105). These are honest guesses, labelled
with `~` in the UI and explained on hover.

`opening_hours` is displayed as the raw OSM string and deliberately **not
parsed** — the format is genuinely gnarly (`Mo-Fr 08:00-18:00; Sa 09:00-13:00;
PH off`) and a wrong "open now" badge is worse than none.

### Overpass needed real tuning

Three findings, each measured on the same area, all load-bearing:

1. **One regex clause per OSM key, not one per tag pair.** 35 separate
   `nwr["amenity"="cafe"]…` clauses blew Overpass's own timeout; six
   `nwr["amenity"~"^(cafe|bar|…)$"]` clauses did not.
2. **A global `[bbox:…]` instead of per-clause `(around:…)`.** With `around`, the
   query silently timed out after 65 seconds. With a bbox it returned 320 places
   in 6 seconds. The bbox is a square, so results are trimmed to the true
   circular radius afterwards with haversine.
3. **`leisure=pitch` is pathologically slow** — ~30 seconds to return 3 results.
   Dropped.

The public instance is also genuinely flaky: it load-balances across backends of
very different health, and an identical query measured 6s on one and a 504 on
another minutes later, with free slots reported either way. So each attempt is
abandoned after 30s and retried up to four times — failing fast and retrying
beats waiting patiently.

**Empty responses are never cached.** An Overpass query that exceeds its own
timeout returns a *successful, empty* body, indistinguishable from "genuinely
nothing here". Caching that would pin a silent failure in place for a week.

### Caching

Successful area queries are recorded in `place_queries` keyed by a ~1km bucket
plus radius and category set, with a 7-day TTL. A repeat visit to the same area
goes from ~14s to ~9ms. Places are also cached in their own table so a saved or
scheduled item still renders when the user has moved or changed the radius.

## Notes for future work

- **Location needs HTTPS in production.** The browser Geolocation API only works
  on a secure origin; localhost is exempt, which is why dev is fine.
- **The day is per calendar date** in the schema (`scheduled_items.day`), but the
  UI only ever shows today. Past days are kept, not overwritten — a date picker
  would be a small addition.
- **No `AnimatePresence`.** Exit animations don't resolve in this motion 12 /
  React 19 pairing — removed items stayed in the DOM after their state was gone,
  and views wedged on the outgoing section. Enter animations and `layout` work
  fine, so those are used throughout and exits are instant. Revisit on upgrade.
- **Nominatim labels can be bureaucratic.** Times Square reverse-geocodes to
  "Manhattan Community Board 5". Accurate, just not how anyone speaks.
- Reduced-motion is honoured globally via `prefers-reduced-motion` in
  `index.css`.
- Rate limiting on the auth endpoints would be wise before this ever faced the
  internet.

## Attribution

Sports fixtures via ESPN's public site API. Ticketed listings via Ticketmaster's
Discovery API. Place data © OpenStreetMap contributors, available under the
[Open Database Licence](https://www.openstreetmap.org/copyright). Reverse
geocoding by [Nominatim](https://nominatim.org/), place search by
[Overpass](https://overpass-api.de/) — both free public services, used within
their usage policies.

## Stack

React 19 · TypeScript · Vite 8 · Tailwind CSS v4 · motion · Hono · Postgres 17 ·
postgres.js · oxlint
