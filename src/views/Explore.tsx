import { useMemo, useState } from 'react'
import { CATEGORY_META } from '@/lib/data'
import { pluralize } from '@/lib/format'
import type { Category } from '@/lib/types'
import { RADIUS_OPTIONS, type AppState } from '@/lib/useAppState'
import { PlaceCard } from '@/components/PlaceCard'
import { PinIcon, SunIcon, XIcon } from '@/components/icons'
import { Badge, Button, Chip, EmptyState, SectionHeader } from '@/components/ui'

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

function LocationBar({ state }: { state: AppState }) {
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

      <label className="flex items-center gap-2">
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

  const [query, setQuery] = useState('')
  const [categories, setCategories] = useState<Set<Category>>(new Set())
  const [freeOnly, setFreeOnly] = useState(false)
  const [sort, setSort] = useState<SortKey>('distance')

  const activeCount = (query.trim() ? 1 : 0) + categories.size + (freeOnly ? 1 : 0)

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()

    const filtered = places.filter((place) => {
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
  }, [places, query, categories, freeOnly, sort])

  const availableCategories = useMemo(() => {
    const counts = new Map<Category, number>()
    for (const place of places) counts.set(place.category, (counts.get(place.category) ?? 0) + 1)
    return counts
  }, [places])

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

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Things to do"
        title={locationLabel ? `What's on near ${locationLabel}?` : 'What are we doing today?'}
        description="Real places from OpenStreetMap, sorted by how far they are from you. Visit lengths are estimates by category — OpenStreetMap records opening hours, not how long you'll stay."
      />

      <LocationBar state={state} />

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
      {places.length > 0 && (
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
      {placesStatus === 'ready' && places.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink-700">
          <span>
            <span className="font-semibold text-ink-900">{results.length}</span>{' '}
            {pluralize(results.length, 'place')}
            {results.length !== places.length && ` of ${places.length}`}
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

      {placesStatus === 'ready' && places.length === 0 && (
        <EmptyState
          emoji="🏜️"
          title="Nothing mapped around here"
          description="OpenStreetMap has no matching places within this radius. Widen the search and there may be more."
          action={<Button onClick={() => state.setRadiusM(10_000)}>Search within 10 km</Button>}
        />
      )}

      {placesStatus === 'ready' && places.length > 0 && results.length === 0 && (
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
    </div>
  )
}
