import { useEffect, useMemo, useState } from 'react'
import { ApiError, type EventItem, api } from '@/lib/api'
import { cx } from '@/lib/cx'
import { CATEGORY_META, FUN_CATEGORIES } from '@/lib/data'
import { pluralize } from '@/lib/format'
import type { Category } from '@/lib/types'
import { RADIUS_OPTIONS, type AppState, type LoadStatus } from '@/lib/useAppState'
import { EventCard } from '@/components/EventCard'
import { PlaceCard } from '@/components/PlaceCard'
import { PinIcon, SparkleIcon, SunIcon, XIcon } from '@/components/icons'
import { Badge, Button, Chip, EmptyState, SectionHeader } from '@/components/ui'

type Tab = 'nearby' | 'fun' | 'events'

const TABS: Array<{ id: Tab; label: string; emoji: string }> = [
  { id: 'nearby', label: 'Nearby', emoji: '📍' },
  { id: 'fun', label: 'Fun', emoji: '🎡' },
  { id: 'events', label: 'Events', emoji: '🎟️' },
]

const FUN_SET = new Set<Category>(FUN_CATEGORIES)

/** Events are worth travelling further for than a coffee. */
const EVENTS_RADIUS_M = 25_000

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
              ? 'Location declined — showing Santa Monica instead.'
              : geo.status === 'prompting'
                ? 'Asking your browser for permission…'
                : 'Showing Santa Monica until you share your location.'
            : `${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)} · accurate to ~${Math.round(
                coords.accuracyM,
              )}m`}
        </p>
      </div>

      {usingFallbackLocation && geo.status !== 'prompting' && (
        <Button variant="bloom" size="sm" onClick={geo.request}>
          <SunIcon className="size-4" />
          Use my location
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
  const [configured, setConfigured] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setError(null)

    api
      .events(coords.lat, coords.lon, EVENTS_RADIUS_M)
      .then((result) => {
        if (cancelled) return
        setEvents(result.events)
        setConfigured(result.configured)
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
  }, [coords.lat, coords.lon, reload])

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
   * Not an error state. OpenStreetMap carries no events at all, so this tab needs
   * a separate provider, and saying so plainly beats showing invented listings.
   */
  if (!configured) {
    return (
      <div className="rounded-shell bg-shell p-6 ring-1 ring-ink-200/70 ring-inset shadow-low sm:p-8">
        <span className="grid size-12 place-items-center rounded-full bg-sun-100 text-2xl" aria-hidden>
          🎟️
        </span>
        <h3 className="mt-4 text-xl font-semibold text-ink-900">Events needs a free API key</h3>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-700">
          Everywhere else in Sundial uses OpenStreetMap, which maps places rather than things
          happening at a time — it has no events data at all. Real listings have to come from an
          events provider, and Ticketmaster's is free and takes about two minutes to set up. No card
          required.
        </p>

        <ol className="mt-5 space-y-3 text-sm text-ink-700">
          {[
            <>
              Get a key at{' '}
              <a
                href="https://developer-acct.ticketmaster.com/user/register"
                target="_blank"
                rel="noreferrer noopener"
                className="font-medium text-bloom-600 underline decoration-bloom-200 underline-offset-2 hover:decoration-bloom-500"
              >
                developer.ticketmaster.com
              </a>{' '}
              and copy the <span className="font-medium text-ink-900">Consumer Key</span>.
            </>,
            <>
              Put it in <code className="rounded bg-sand px-1.5 py-0.5 text-xs">server/.env</code> as{' '}
              <code className="rounded bg-sand px-1.5 py-0.5 text-xs">TICKETMASTER_API_KEY=…</code>
            </>,
            <>
              Restart the API (<code className="rounded bg-sand px-1.5 py-0.5 text-xs">pnpm dev:api</code>
              ) and reload this tab.
            </>,
          ].map((step, index) => (
            <li key={index} className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-sun-400 text-xs font-semibold text-ink-900">
                {index + 1}
              </span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>

        <div className="mt-6">
          <Button onClick={() => setReload((value) => value + 1)}>
            <SparkleIcon className="size-4" />
            I've added a key — check again
          </Button>
        </div>
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <EmptyState
        emoji="🌙"
        title="Nothing on around here"
        description={`No listed events within ${EVENTS_RADIUS_M / 1000} km of ${
          locationLabel ?? 'your location'
        } right now. Quiet week.`}
        action={<Button onClick={() => setReload((value) => value + 1)}>Check again</Button>}
      />
    )
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-ink-700">
        <span className="font-semibold text-ink-900">{events.length}</span>{' '}
        {pluralize(events.length, 'event')} within {EVENTS_RADIUS_M / 1000} km, soonest first
      </p>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {events.map((event, index) => (
          <EventCard key={event.id} event={event} index={index} />
        ))}
      </div>
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

  const [tab, setTab] = useState<Tab>('nearby')
  const [query, setQuery] = useState('')
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
    setTab(next)
    reset()
  }

  const HEADINGS: Record<Tab, { title: string; description: string }> = {
    nearby: {
      title: locationLabel ? `What's on near ${locationLabel}?` : 'What are we doing today?',
      description:
        "Real places from OpenStreetMap, sorted by how far they are from you. Visit lengths are estimates by category — OpenStreetMap records opening hours, not how long you'll stay.",
    },
    fun: {
      title: locationLabel ? `Something fun in ${locationLabel}` : 'Something fun',
      description:
        'Piers, arcades, bowling, escape rooms, aquariums, bars and studios — the same real OpenStreetMap data, narrowed to the places you go to enjoy yourself.',
    },
    events: {
      title: locationLabel ? `On soon near ${locationLabel}` : 'On soon near you',
      description:
        'Real dated listings — gigs, matches, theatre — soonest first, with what tickets actually cost. This tab uses a separate events provider, since OpenStreetMap has no events data.',
    },
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Things to do"
        title={HEADINGS[tab].title}
        description={HEADINGS[tab].description}
      />

      <TabBar tab={tab} onChange={changeTab} />

      <LocationBar state={state} showRadius={tab !== 'events'} />

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
          title="Couldn't reach OpenStreetMap"
          description={
            placesError ??
            'The free public OpenStreetMap service is busy. It usually clears in a few seconds.'
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
      {placesStatus !== 'loading' && results.length > 0 && (
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
            />
          ))}
        </div>
      )}
        </>
      )}
    </div>
  )
}
