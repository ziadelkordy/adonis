import { useEffect, useMemo, useState } from 'react'
import { ApiError, type Place, api } from '@/lib/api'
import { CATEGORY_META } from '@/lib/data'
import { formatDistance, pluralize } from '@/lib/format'
import type { Category } from '@/lib/types'
import { type AppState, type LoadStatus } from '@/lib/useAppState'
import { MapView, type MapMarker } from '@/components/MapView'
import { PlaceCard } from '@/components/PlaceCard'
import { XIcon } from '@/components/icons'
import { Badge, Button, Chip, EmptyState, SectionHeader } from '@/components/ui'

/*
 * Escapes used to be ten hard-coded destinations with invented nightly rates and
 * flight times — the one part of the app that wasn't real. It now runs the same
 * OpenStreetMap pipeline at a much wider radius, restricted to places worth a
 * drive: beaches, nature reserves, viewpoints, theme parks, zoos, aquariums.
 *
 * The invented numbers are simply gone. Nightly rates and flight times can't come
 * from a free, keyless source, and guessing them was worse than omitting them.
 */

const RADIUS_OPTIONS = [
  { value: 15_000, label: '15 km' },
  { value: 25_000, label: '25 km' },
  { value: 40_000, label: '40 km' },
]

type SortKey = 'distance-desc' | 'distance-asc' | 'name'

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'distance-desc', label: 'Furthest first' },
  { value: 'distance-asc', label: 'Closest first' },
  { value: 'name', label: 'Name (A–Z)' },
]

export function Escapes({ state }: { state: AppState }) {
  const { coords, locationLabel, savedIds, scheduledPlaceIds, toggleSaved, addToDay, openDetail } =
    state

  const [places, setPlaces] = useState<Place[]>([])
  const [status, setStatus] = useState<LoadStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [cached, setCached] = useState(false)
  const [radiusM, setRadiusM] = useState(25_000)
  const [categories, setCategories] = useState<Set<Category>>(new Set())
  const [sort, setSort] = useState<SortKey>('distance-desc')
  const [view, setView] = useState<'grid' | 'map'>('grid')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setError(null)

    api
      .escapes(coords.lat, coords.lon, radiusM)
      .then((result) => {
        if (cancelled) return
        setPlaces(result.places)
        setCached(result.cached)
        setStatus('ready')
      })
      .catch((caught) => {
        if (cancelled) return
        setError(caught instanceof ApiError ? caught.message : 'Could not load escapes.')
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [coords.lat, coords.lon, radiusM, reload])

  const counts = useMemo(() => {
    const map = new Map<Category, number>()
    for (const place of places) map.set(place.category, (map.get(place.category) ?? 0) + 1)
    return map
  }, [places])

  const results = useMemo(() => {
    const filtered =
      categories.size === 0 ? places : places.filter((place) => categories.has(place.category))

    const sorted = [...filtered]
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name))
    else if (sort === 'distance-asc') sorted.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
    // Furthest first by default: the point of this tab is getting out of town.
    else sorted.sort((a, b) => (b.distanceKm ?? 0) - (a.distanceKm ?? 0))

    return sorted
  }, [places, categories, sort])

  const markers = useMemo<MapMarker[]>(
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

  const toggleCategory = (category: Category) => {
    setCategories((current) => {
      const next = new Set(current)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  const furthest = results.reduce((max, place) => Math.max(max, place.distanceKm ?? 0), 0)

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Escapes"
        title={locationLabel ? `Out of ${locationLabel} for the day` : 'Out of town for the day'}
        description="Real beaches, nature reserves, viewpoints, theme parks and aquariums within driving distance — the same OpenStreetMap data as everywhere else, just further out."
      />

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <span className="text-sm text-ink-700">Within</span>
          <select
            value={radiusM}
            onChange={(event) => setRadiusM(Number(event.target.value))}
            className="h-11 rounded-full bg-shell px-4 pr-9 text-sm font-medium text-ink-900 ring-1 ring-ink-200 ring-inset shadow-low transition hover:ring-sun-300 focus:ring-2 focus:ring-bloom-400 focus:outline-none"
          >
            {RADIUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

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

        <div
          role="group"
          aria-label="How to show results"
          className="flex gap-1 rounded-full bg-sand/80 p-1 ring-1 ring-ink-200/70 ring-inset"
        >
          {(['grid', 'map'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={view === mode}
              onClick={() => setView(mode)}
              className={
                view === mode
                  ? 'h-9 rounded-full bg-shell px-4 text-sm font-medium text-ink-900 shadow-low'
                  : 'h-9 rounded-full px-4 text-sm font-medium text-ink-500 hover:text-ink-800'
              }
            >
              {mode === 'grid' ? 'List' : 'Map'}
            </button>
          ))}
        </div>

        {categories.size > 0 && (
          <Button variant="ghost" onClick={() => setCategories(new Set())}>
            <XIcon className="size-4" />
            Reset
          </Button>
        )}
      </div>

      {places.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {[...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([category, count]) => (
              <Chip
                key={category}
                selected={categories.has(category)}
                onClick={() => toggleCategory(category)}
              >
                <span aria-hidden>{CATEGORY_META[category].emoji}</span>
                {CATEGORY_META[category].label}
                <span className="text-ink-400">{count}</span>
              </Chip>
            ))}
        </div>
      )}

      {status === 'ready' && places.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink-700">
          <span>
            <span className="font-semibold text-ink-900">{results.length}</span>{' '}
            {pluralize(results.length, 'escape')}
            {results.length !== places.length && ` of ${places.length}`}
            {furthest > 0 && ` · out to ${formatDistance(furthest)}`}
          </span>
          {cached ? <Badge tone="lagoon">from cache</Badge> : <Badge tone="sun">live</Badge>}
        </p>
      )}

      {status === 'loading' && (
        <div className="space-y-4">
          {/* Measured: a cold wide-area query can take a full minute. Say so
              rather than appear hung. It's ~5ms once cached. */}
          <p className="text-sm text-ink-700">
            Searching a wide area. The first look at a region can take up to a minute — it's
            instant after that.
          </p>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <div
                key={index}
                className="h-80 animate-pulse rounded-shell bg-sand/70 ring-1 ring-ink-200/60 ring-inset"
              />
            ))}
          </div>
        </div>
      )}

      {status === 'error' && (
        <EmptyState
          emoji="🛰️"
          title="This area hasn't been loaded yet"
          description={
            'Day trips come from OpenStreetMap, and the public service refuses requests from the ' +
            'server this app runs on. Areas loaded before are instant; new ones need warming up ' +
            `first. A narrower radius may already be cached.${error ? ` (${error})` : ''}`
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => setReload((value) => value + 1)}>Try again</Button>
              {radiusM > 15_000 && (
                <Button variant="secondary" onClick={() => setRadiusM(15_000)}>
                  Try 15 km instead
                </Button>
              )}
            </div>
          }
        />
      )}

      {status === 'ready' && places.length === 0 && (
        <EmptyState
          emoji="🏜️"
          title="No day trips mapped around here"
          description="OpenStreetMap has no beaches, reserves, viewpoints or parks recorded within this radius. Widening the search may turn something up."
          action={
            radiusM < 40_000 ? (
              <Button onClick={() => setRadiusM(40_000)}>Search within 40 km</Button>
            ) : undefined
          }
        />
      )}

      {status === 'ready' && results.length === 0 && places.length > 0 && (
        <EmptyState
          emoji="🪺"
          title="Nothing of that kind out there"
          description="Clear the category filters to see everything within range."
          action={<Button onClick={() => setCategories(new Set())}>Show everything</Button>}
        />
      )}

      {status === 'ready' && results.length > 0 && view === 'map' && (
        <MapView
          center={coords}
          markers={markers}
          selectedId={state.route.detail}
          onSelect={(id) => openDetail(id)}
          className="h-[32rem] w-full overflow-hidden rounded-shell ring-1 ring-ink-200 ring-inset shadow-low"
        />
      )}

      {status === 'ready' && results.length > 0 && view === 'grid' && (
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
              onOpen={() => openDetail(place.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
