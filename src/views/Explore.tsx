import { useEffect, useMemo, useState } from 'react'
import { ApiError, type EventItem, api } from '@/lib/api'
import { cx } from '@/lib/cx'
import { CATEGORY_META, FUN_CATEGORIES } from '@/lib/data'
import { pluralize } from '@/lib/format'
import type { Category } from '@/lib/types'
import { RADIUS_OPTIONS, type AppState, type LoadStatus } from '@/lib/useAppState'
import { EventCard } from '@/components/EventCard'
import { MapView, type MapMarker } from '@/components/MapView'
import { PlaceCard } from '@/components/PlaceCard'
import { PinIcon, SparkleIcon, SunIcon, XIcon } from '@/components/icons'
import { Badge, Button, Chip, EmptyState, SectionHeader } from '@/components/ui'

type Tab = 'nearby' | 'fun' | 'events'

/*
 * These sit *under* the location bar, not beside it: "nearby" is the context the
 * whole tab shares, and these choose what kind of nearby thing to show. The route
 * segment stays 'nearby' so existing links keep working.
 */
const TABS: Array<{ id: Tab; label: string; emoji: string }> = [
  { id: 'nearby', label: 'Everything', emoji: '✳️' },
  { id: 'fun', label: 'Fun', emoji: '🎡' },
  { id: 'events', label: 'Events', emoji: '🎟️' },
]

const FUN_SET = new Set<Category>(FUN_CATEGORIES)

/*
 * Events get their own, wider radii: you'll cross a city for a match or a gig,
 * and stadiums and arenas are usually well outside a 2km walk.
 */
const EVENT_RADIUS_OPTIONS = [
  { value: 25_000, label: '25 km' },
  { value: 50_000, label: '50 km' },
  { value: 100_000, label: '100 km' },
]

/**
 * What to browse events by. Ticketmaster splits classification into a broad
 * `segment` (Music / Sports / Arts & Theatre) and a narrower `genre` (Football,
 * Comedy, Rock), so these match on whichever is the natural fit — "Sports" is a
 * segment, "Football" and "Comedy" are genres.
 */
const EVENT_FILTERS: Array<{
  id: string
  label: string
  emoji: string
  matches: (event: EventItem) => boolean
}> = [
  { id: 'music', label: 'Music', emoji: '🎵', matches: (e) => e.segment === 'Music' },
  { id: 'sports', label: 'Sports', emoji: '🏟️', matches: (e) => e.segment === 'Sports' },
  {
    id: 'football',
    label: 'Football',
    emoji: '🏈',
    // Catches both "Football" and "American Football".
    matches: (e) => /football/i.test(e.genre ?? ''),
  },
  { id: 'comedy', label: 'Comedy', emoji: '🎤', matches: (e) => /comedy/i.test(e.genre ?? '') },
  {
    id: 'shows',
    label: 'Shows & theatre',
    emoji: '🎭',
    matches: (e) => e.segment === 'Arts & Theatre',
  },
  {
    id: 'family',
    label: 'Family',
    emoji: '🎠',
    matches: (e) => /family|children/i.test(`${e.segment ?? ''} ${e.genre ?? ''}`),
  },
]

type SortKey = 'distance' | 'name' | 'duration'

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'distance', label: 'Closest first' },
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'duration', label: 'Shortest visit' },
]

const CATEGORY_IDS = Object.keys(CATEGORY_META) as Category[]

/* -------------------------------------------------------------------------- */
/* Location bar                                                                */
/* -------------------------------------------------------------------------- */

function LocationBar({
  state,
  showRadius = true,
}: {
  state: AppState
  /** Events use their own fixed radius, so the picker would be misleading there. */
  showRadius?: boolean
}) {
  const { geo, locationLabel, usingFallbackLocation, radiusM, setRadiusM, coords } = state

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-shell bg-sunrise p-4 ring-1 ring-white/70 ring-inset shadow-low">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-shell/80 text-bloom-500 shadow-low">
        <PinIcon className="size-5" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink-900">
          {locationLabel ?? 'Locating…'}
          {geo.status === 'granted' && !usingFallbackLocation && (
            <span className="ml-2 align-middle text-xs font-normal text-lagoon-600">
              · your location
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-ink-700">
          {usingFallbackLocation
            ? geo.status === 'denied'
              ? /* Once blocked, only the browser can undo it — so say where. */
                'Location is blocked for this site. Click the icon at the left of the address bar, allow location, then press the button here.'
              : geo.status === 'prompting'
                ? 'Asking your browser for permission…'
                : geo.status === 'unavailable'
                  ? 'This browser cannot report a location. Showing Santa Monica.'
                  : geo.status === 'error'
                    ? `${geo.message ?? 'Location unavailable'} — showing Santa Monica.`
                    : 'Showing Santa Monica until you share your location.'
            : `${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)} · accurate to ~${Math.round(
                coords.accuracyM,
              )}m`}
        </p>
      </div>

      {usingFallbackLocation && geo.status !== 'prompting' && (
        <Button variant="bloom" size="sm" onClick={geo.retry}>
          <SunIcon className="size-4" />
          {geo.status === 'denied' ? 'Try again' : 'Use my location'}
        </Button>
      )}

      <label className={cx('flex items-center gap-2', !showRadius && 'hidden')}>
        <span className="text-xs font-medium text-ink-700">Within</span>
        <select
          value={radiusM}
          onChange={(event) => setRadiusM(Number(event.target.value))}
          className="h-9 rounded-full bg-shell px-3 pr-8 text-sm font-medium text-ink-900 ring-1 ring-ink-200 ring-inset shadow-low transition hover:ring-sun-300 focus:ring-2 focus:ring-bloom-400 focus:outline-none"
        >
          {RADIUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Tab bar                                                                     */
/* -------------------------------------------------------------------------- */

function TabBar({ tab, onChange }: { tab: Tab; onChange: (next: Tab) => void }) {
  return (
    <div
      role="tablist"
      aria-label="What to browse"
      className="flex w-full gap-1 rounded-full bg-sand/80 p-1 ring-1 ring-ink-200/70 ring-inset sm:w-fit"
    >
      {TABS.map((entry) => (
        <button
          key={entry.id}
          type="button"
          role="tab"
          aria-selected={tab === entry.id}
          onClick={() => onChange(entry.id)}
          className={cx(
            'inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full px-4',
            'text-sm font-medium whitespace-nowrap transition-colors duration-200 sm:flex-none',
            tab === entry.id
              ? 'bg-shell text-ink-900 shadow-low'
              : 'text-ink-500 hover:text-ink-800',
          )}
        >
          <span aria-hidden>{entry.emoji}</span>
          {entry.label}
        </button>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Events tab                                                                  */
/* -------------------------------------------------------------------------- */

function EventsTab({ state }: { state: AppState }) {
  const { coords, locationLabel } = state

  const [events, setEvents] = useState<EventItem[]>([])
  const [status, setStatus] = useState<LoadStatus>('idle')
  const [ticketingConfigured, setTicketingConfigured] = useState(true)
  const [venuesPending, setVenuesPending] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [radiusM, setRadiusM] = useState(EVENT_RADIUS_OPTIONS[0].value)
  const [active, setActive] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setError(null)

    api
      .events(coords.lat, coords.lon, radiusM)
      .then((result) => {
        if (cancelled) return
        setEvents(result.events)
        setTicketingConfigured(result.ticketingConfigured)
        setVenuesPending(result.venuesPending)
        setStatus('ready')
      })
      .catch((caught) => {
        if (cancelled) return
        setError(caught instanceof ApiError ? caught.message : 'Could not load events.')
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [coords.lat, coords.lon, radiusM, reload])

  /** Counts come from the full result set, so a chip showing 0 is honest. */
  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const filter of EVENT_FILTERS) {
      map.set(filter.id, events.filter((event) => filter.matches(event)).length)
    }
    return map
  }, [events])

  // Filters are OR-ed: picking Football and Comedy shows both.
  const visible = useMemo(() => {
    if (active.size === 0) return events
    const chosen = EVENT_FILTERS.filter((filter) => active.has(filter.id))
    return events.filter((event) => chosen.some((filter) => filter.matches(event)))
  }, [events, active])

  const toggle = (id: string) => {
    setActive((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const radiusPicker = (
    <label className="flex items-center gap-2">
      <span className="text-sm text-ink-700">Within</span>
      <select
        value={radiusM}
        onChange={(event) => setRadiusM(Number(event.target.value))}
        className="h-11 rounded-full bg-shell px-4 pr-9 text-sm font-medium text-ink-900 ring-1 ring-ink-200 ring-inset shadow-low transition hover:ring-sun-300 focus:ring-2 focus:ring-bloom-400 focus:outline-none"
      >
        {EVENT_RADIUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )

  if (status === 'loading') {
    return (
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="h-80 animate-pulse rounded-shell bg-sand/70 ring-1 ring-ink-200/60 ring-inset"
          />
        ))}
      </div>
    )
  }

  if (status === 'error') {
    return (
      <EmptyState
        emoji="🎟️"
        title="Couldn't load events"
        description={error ?? 'The events provider is unavailable right now.'}
        action={<Button onClick={() => setReload((value) => value + 1)}>Try again</Button>}
      />
    )
  }

  /*
   * Sports fixtures need no key, so this is a slim aside rather than a wall: it
   * only explains what a ticketing key would *add* (comedy, music, theatre).
   */
  const ticketingNote = !ticketingConfigured && (
    <div className="rounded-petal bg-sun-50 p-4 ring-1 ring-sun-200 ring-inset">
      <p className="text-sm text-ink-800">
        <span className="font-semibold">Sports fixtures need no setup</span> — these come straight
        from public schedules. Comedy, music and theatre listings need a free{' '}
        <a
          href="https://developer-acct.ticketmaster.com/user/register"
          target="_blank"
          rel="noreferrer noopener"
          className="font-medium text-bloom-600 underline decoration-bloom-200 underline-offset-2 hover:decoration-bloom-500"
        >
          Ticketmaster key
        </a>{' '}
        (no card): put it in <code className="rounded bg-sand px-1.5 py-0.5 text-xs">server/.env</code>{' '}
        as <code className="rounded bg-sand px-1.5 py-0.5 text-xs">TICKETMASTER_API_KEY</code> and
        restart the API.
      </p>
      <div className="mt-3">
        <Button size="sm" variant="secondary" onClick={() => setReload((value) => value + 1)}>
          <SparkleIcon className="size-4" />
          I've added a key — check again
        </Button>
      </div>
    </div>
  )

  /*
   * Venues arrive from the schedules without coordinates and are geocoded in the
   * background at one per second, so an early visit can legitimately have nothing
   * to show yet. Saying so beats an empty grid that looks broken.
   */
  if (events.length === 0 && venuesPending > 0) {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">{radiusPicker}</div>
        <EmptyState
          emoji="🛰️"
          title="Working out which venues are near you"
          description={`Sports schedules list a venue name but no coordinates, so Sundial is looking up ${venuesPending} of them in the background. Give it a moment and check again.`}
          action={
            <Button onClick={() => setReload((value) => value + 1)}>
              <SparkleIcon className="size-4" />
              Check again
            </Button>
          }
        />
        {ticketingNote}
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">{radiusPicker}</div>
        <EmptyState
          emoji="🌙"
          title="Nothing on around here"
          description={`No listed events within ${radiusM / 1000} km of ${
            locationLabel ?? 'your location'
          } right now. Try a wider radius, or check back later.`}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {radiusM < 100_000 && (
                <Button onClick={() => setRadiusM(100_000)}>Search within 100 km</Button>
              )}
              <Button variant="secondary" onClick={() => setReload((value) => value + 1)}>
                Check again
              </Button>
            </div>
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        {radiusPicker}
        {active.size > 0 && (
          <Button variant="ghost" onClick={() => setActive(new Set())}>
            <XIcon className="size-4" />
            Show everything
          </Button>
        )}
      </div>

      {/* What kind of thing — football, comedy, gigs, theatre */}
      <div className="flex flex-wrap items-center gap-2">
        {EVENT_FILTERS.map((filter) => {
          const count = counts.get(filter.id) ?? 0
          if (count === 0 && !active.has(filter.id)) return null
          return (
            <Chip
              key={filter.id}
              selected={active.has(filter.id)}
              onClick={() => toggle(filter.id)}
            >
              <span aria-hidden>{filter.emoji}</span>
              {filter.label}
              <span className="text-ink-400">{count}</span>
            </Chip>
          )
        })}
      </div>

      <p className="flex flex-wrap items-center gap-2 text-sm text-ink-700">
        <span>
          <span className="font-semibold text-ink-900">{visible.length}</span>{' '}
          {pluralize(visible.length, 'event')}
          {visible.length !== events.length && ` of ${events.length}`} within {radiusM / 1000} km,
          soonest first
        </span>
        {venuesPending > 0 && (
          <Badge tone="sun">still locating {venuesPending} venues</Badge>
        )}
      </p>

      {ticketingNote}

      {visible.length === 0 ? (
        <EmptyState
          emoji="🎭"
          title="Nothing of that kind on"
          description="No events near you match those filters right now. Clear them to see everything that's on."
          action={<Button onClick={() => setActive(new Set())}>Show everything</Button>}
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((event, index) => (
            <EventCard
              key={event.id}
              event={event}
              index={index}
              scheduled={state.scheduledEventIds.has(event.id)}
              onAdd={() => void state.addEventToDay(event)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Explore                                                                     */
/* -------------------------------------------------------------------------- */

export function Explore({ state }: { state: AppState }) {
  const {
    places,
    placesStatus,
    placesError,
    servedFromCache,
    reloadNearby,
    savedIds,
    scheduledPlaceIds,
    toggleSaved,
    addToDay,
    locationLabel,
  } = state

  const { route, router } = state
  const tab = route.tab
  // Search lives in the URL too, so a filtered view can be shared.
  const query = route.query
  const setQuery = (next: string) =>
    router.update({ section: 'explore', tab, query: next }, 'replace')

  const [categories, setCategories] = useState<Set<Category>>(new Set())
  const [freeOnly, setFreeOnly] = useState(false)
  const [sort, setSort] = useState<SortKey>('distance')

  const activeCount = (query.trim() ? 1 : 0) + categories.size + (freeOnly ? 1 : 0)

  /*
   * The Fun tab is a narrowed view of the same fetch rather than its own request,
   * so switching tabs is instant and costs nothing.
   */
  const basePlaces = useMemo(
    () => (tab === 'fun' ? places.filter((place) => FUN_SET.has(place.category)) : places),
    [tab, places],
  )

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()

    const filtered = basePlaces.filter((place) => {
      if (categories.size > 0 && !categories.has(place.category)) return false
      // OSM records `fee` only occasionally, so this means "known to be free".
      if (freeOnly && place.fee !== false) return false
      if (needle) {
        const haystack = [place.name, place.neighborhood, place.cuisine, place.category]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(needle)) return false
      }
      return true
    })

    const sorted = [...filtered]
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name))
    else if (sort === 'duration') sorted.sort((a, b) => a.durationMin - b.durationMin)
    else sorted.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))

    return sorted
  }, [basePlaces, query, categories, freeOnly, sort])

  const mapMarkers = useMemo<MapMarker[]>(
    () =>
      results.map((place) => ({
        id: place.id,
        lat: place.lat,
        lon: place.lon,
        label: place.name,
        kind: 'place' as const,
      })),
    [results],
  )

  const availableCategories = useMemo(() => {
    const counts = new Map<Category, number>()
    for (const place of basePlaces) {
      counts.set(place.category, (counts.get(place.category) ?? 0) + 1)
    }
    return counts
  }, [basePlaces])

  const toggleCategory = (category: Category) => {
    setCategories((current) => {
      const next = new Set(current)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  const reset = () => {
    setQuery('')
    setCategories(new Set())
    setFreeOnly(false)
  }

  /*
   * Filters reset on tab change. A category chosen under Nearby may not exist at
   * all within Fun, which would land the user on an unexplained empty grid.
   */
  const changeTab = (next: Tab) => {
    if (next === tab) return
    setCategories(new Set())
    setFreeOnly(false)
    router.update({ section: 'explore', tab: next, query: '' })
  }

  const HEADINGS: Record<Tab, { title: string; description: string }> = {
    nearby: {
      title: locationLabel ? `Near ${locationLabel}` : 'Near you',
      description:
        "Real places from OpenStreetMap, sorted by how far they are from you. Visit lengths are estimates by category — OpenStreetMap records opening hours, not how long you'll stay.",
    },
    fun: {
      title: locationLabel ? `Something fun near ${locationLabel}` : 'Something fun',
      description:
        'Piers, arcades, bowling, escape rooms, aquariums, bars and studios — the same real OpenStreetMap data, narrowed to the places you go to enjoy yourself.',
    },
    events: {
      title: locationLabel ? `On soon near ${locationLabel}` : 'On soon near you',
      description:
        "Real dated listings near you, soonest first. Football, baseball, basketball, hockey and soccer fixtures come from public schedules and need no setup; comedy, gigs and theatre — with ticket prices — need a free key.",
    },
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Things to do"
        title={HEADINGS[tab].title}
        description={HEADINGS[tab].description}
      />

      <LocationBar state={state} showRadius={tab !== 'events'} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabBar tab={tab} onChange={changeTab} />

        {/* A location app should be able to show you a map. */}
        {tab !== 'events' && (
          <div
            role="group"
            aria-label="How to show results"
            className="flex gap-1 rounded-full bg-sand/80 p-1 ring-1 ring-ink-200/70 ring-inset"
          >
            {(['grid', 'map'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={route.view === mode}
                onClick={() => router.update({ section: 'explore', tab, view: mode })}
                className={cx(
                  'h-9 rounded-full px-4 text-sm font-medium capitalize transition-colors duration-200',
                  route.view === mode
                    ? 'bg-shell text-ink-900 shadow-low'
                    : 'text-ink-500 hover:text-ink-800',
                )}
              >
                {mode === 'grid' ? 'List' : 'Map'}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === 'events' && <EventsTab state={state} />}

      {tab !== 'events' && (
        <>
      {/* Search + sort */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-auto sm:min-w-56 sm:flex-1">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, area or cuisine…"
            aria-label="Search nearby places"
            className="h-11 w-full rounded-full bg-shell px-5 text-sm text-ink-900 ring-1 ring-ink-200 ring-inset shadow-low transition placeholder:text-ink-400 hover:ring-sun-300 focus:ring-2 focus:ring-bloom-400 focus:outline-none"
          />
        </div>

        <label className="flex items-center gap-2">
          <span className="text-sm text-ink-700">Sort</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            className="h-11 rounded-full bg-shell px-4 pr-9 text-sm font-medium text-ink-900 ring-1 ring-ink-200 ring-inset shadow-low transition hover:ring-sun-300 focus:ring-2 focus:ring-bloom-400 focus:outline-none"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {activeCount > 0 && (
          <Button variant="ghost" onClick={reset}>
            <XIcon className="size-4" />
            Reset
          </Button>
        )}
      </div>

      {/* Category chips, showing only categories actually present nearby */}
      {basePlaces.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {CATEGORY_IDS.filter((category) => availableCategories.has(category)).map((category) => (
            <Chip
              key={category}
              selected={categories.has(category)}
              onClick={() => toggleCategory(category)}
            >
              <span aria-hidden>{CATEGORY_META[category].emoji}</span>
              {CATEGORY_META[category].label}
              <span className="text-ink-400">{availableCategories.get(category)}</span>
            </Chip>
          ))}
          <span className="mx-1 hidden h-6 w-px bg-ink-200 sm:block" aria-hidden />
          <Chip selected={freeOnly} onClick={() => setFreeOnly((value) => !value)}>
            Known free
          </Chip>
        </div>
      )}

      {/* Status line */}
      {placesStatus === 'ready' && basePlaces.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink-700">
          <span>
            <span className="font-semibold text-ink-900">{results.length}</span>{' '}
            {pluralize(results.length, 'place')}
            {results.length !== basePlaces.length && ` of ${basePlaces.length}`}
          </span>
          {servedFromCache ? (
            <Badge tone="lagoon">from cache</Badge>
          ) : (
            <Badge tone="sun">live from OpenStreetMap</Badge>
          )}
        </p>
      )}

      {/* Loading */}
      {placesStatus === 'loading' && (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className="h-80 animate-pulse rounded-shell bg-sand/70 ring-1 ring-ink-200/60 ring-inset"
            />
          ))}
        </div>
      )}

      {/* Upstream failure — distinct from "nothing matched" */}
      {placesStatus === 'error' && (
        <EmptyState
          emoji="🛰️"
          title="This area hasn't been loaded yet"
          description={
            "Sundial reads places from OpenStreetMap, and the public service it uses won't accept " +
            'requests from the server this app runs on. Areas that have been loaded before are ' +
            'served instantly from the database; new ones need warming up first. Somewhere already ' +
            `loaded will work right now.${placesError ? ` (${placesError})` : ''}`
          }
          action={<Button onClick={() => void reloadNearby()}>Try again</Button>}
        />
      )}

      {placesStatus === 'ready' && basePlaces.length === 0 && (
        <EmptyState
          emoji={tab === 'fun' ? '🎡' : '🏜️'}
          title={tab === 'fun' ? 'Nothing especially fun nearby' : 'Nothing mapped around here'}
          description={
            tab === 'fun'
              ? 'No piers, arcades, bars or studios mapped within this radius. Widen the search, or try the Nearby tab for everything else around you.'
              : 'OpenStreetMap has no matching places within this radius. Widen the search and there may be more.'
          }
          action={<Button onClick={() => state.setRadiusM(10_000)}>Search within 10 km</Button>}
        />
      )}

      {placesStatus === 'ready' && basePlaces.length > 0 && results.length === 0 && (
        <EmptyState
          emoji="🪺"
          title="Nothing matches that combination"
          description="Your filters have squeezed everything out. Clear them and there will be plenty again."
          action={<Button onClick={reset}>Reset filters</Button>}
        />
      )}

      {/*
       * Hidden while loading. Keeping the previous location's cards on screen
       * during a refetch showed "What's on near Manhattan?" above a grid of
       * Santa Monica places — the state is kept, just not displayed, so a failed
       * refetch can still fall back to it.
       */}
      {placesStatus !== 'loading' && results.length > 0 && route.view === 'map' && (
        <div className="space-y-3">
          <MapView
            center={state.coords}
            markers={mapMarkers}
            selectedId={route.detail}
            onSelect={(id) => state.openDetail(id)}
            className="h-[32rem] w-full overflow-hidden rounded-shell ring-1 ring-ink-200 ring-inset shadow-low"
          />
          <p className="text-xs text-ink-500">
            Tap a pin to see the place. Scroll-zoom is off on purpose so the page still scrolls —
            use the + / − controls.
          </p>
        </div>
      )}

      {placesStatus !== 'loading' && results.length > 0 && route.view === 'grid' && (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {results.map((place, index) => (
            <PlaceCard
              key={place.id}
              place={place}
              index={index}
              saved={savedIds.has(place.id)}
              scheduled={scheduledPlaceIds.has(place.id)}
              onToggleSaved={() => void toggleSaved(place.id)}
              onAdd={() => void addToDay(place)}
              onOpen={() => state.openDetail(place.id)}
            />
          ))}
        </div>
      )}
        </>
      )}
    </div>
  )
}
