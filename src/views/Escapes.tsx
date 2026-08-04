import { useMemo, useState } from 'react'
import { DESTINATIONS } from '@/lib/data'
import { formatPrice, pluralize } from '@/lib/format'
import type { AppState } from '@/lib/useAppState'
import { DestinationCard } from '@/components/DestinationCard'
import { XIcon } from '@/components/icons'
import { Button, Chip, EmptyState, SectionHeader } from '@/components/ui'

type SortKey = 'featured' | 'price-asc' | 'price-desc' | 'flight' | 'rating' | 'warmest'

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'featured', label: 'Featured' },
  { value: 'price-asc', label: 'Nightly: low to high' },
  { value: 'price-desc', label: 'Nightly: high to low' },
  { value: 'flight', label: 'Shortest flight' },
  { value: 'rating', label: 'Highest rated' },
  { value: 'warmest', label: 'Warmest' },
]

const BUDGET_OPTIONS = [
  { value: Infinity, label: 'Any budget' },
  { value: 120, label: 'Under $120' },
  { value: 200, label: 'Under $200' },
  { value: 260, label: 'Under $260' },
]

const FLIGHT_OPTIONS = [
  { value: Infinity, label: 'Any flight' },
  { value: 6, label: 'Under 6h' },
  { value: 14, label: 'Under 14h' },
]

export function Escapes({ state }: { state: AppState }) {
  const { savedIds, toggleSaved } = state
  const [budget, setBudget] = useState<number>(Infinity)
  const [maxFlight, setMaxFlight] = useState<number>(Infinity)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('featured')

  const isFiltered = budget !== Infinity || maxFlight !== Infinity || query.trim().length > 0

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()

    const filtered = DESTINATIONS.filter((destination) => {
      if (destination.nightlyFrom > budget) return false
      if (destination.flightHours > maxFlight) return false
      if (needle) {
        const haystack = [
          destination.name,
          destination.region,
          destination.country,
          destination.blurb,
          ...destination.vibes,
        ]
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(needle)) return false
      }
      return true
    })

    const sorted = [...filtered]
    switch (sort) {
      case 'price-asc':
        sorted.sort((a, b) => a.nightlyFrom - b.nightlyFrom)
        break
      case 'price-desc':
        sorted.sort((a, b) => b.nightlyFrom - a.nightlyFrom)
        break
      case 'flight':
        sorted.sort((a, b) => a.flightHours - b.flightHours)
        break
      case 'rating':
        sorted.sort((a, b) => b.rating - a.rating)
        break
      case 'warmest':
        sorted.sort((a, b) => b.avgTempC - a.avgTempC)
        break
      default:
        sorted.sort((a, b) => b.rating * 100 - b.flightHours - (a.rating * 100 - a.flightHours))
    }
    return sorted
  }, [budget, maxFlight, query, sort])

  const cheapest = useMemo(
    () => results.reduce((min, destination) => Math.min(min, destination.nightlyFrom), Infinity),
    [results],
  )

  const resetAll = () => {
    setBudget(Infinity)
    setMaxFlight(Infinity)
    setQuery('')
  }

  return (
    <div className="space-y-7">
      <SectionHeader
        eyebrow="Vacation spots"
        title="Somewhere warm, eventually"
        description="Ten places worth blocking out a week for, with what a night actually costs and how long you will be on a plane."
      />

      {/* Filter row */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-auto sm:min-w-56 sm:flex-1">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search cenotes, lemon groves, kitesurfing…"
              aria-label="Search destinations"
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

          {isFiltered && (
            <Button variant="ghost" onClick={resetAll}>
              <XIcon className="size-4" />
              Reset
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {BUDGET_OPTIONS.map((option) => (
            <Chip
              key={option.label}
              selected={budget === option.value}
              onClick={() => setBudget(option.value)}
            >
              {option.label}
            </Chip>
          ))}
          <span className="mx-1 hidden h-6 w-px bg-ink-200 sm:block" aria-hidden />
          {FLIGHT_OPTIONS.map((option) => (
            <Chip
              key={option.label}
              selected={maxFlight === option.value}
              onClick={() => setMaxFlight(option.value)}
            >
              {option.label}
            </Chip>
          ))}
        </div>
      </div>

      {results.length > 0 && (
        <p className="text-sm text-ink-700">
          <span className="font-semibold text-ink-900">{results.length}</span>{' '}
          {pluralize(results.length, 'destination')}
          {cheapest !== Infinity && <> · from {formatPrice(cheapest)} a night</>}
        </p>
      )}

      {results.length === 0 ? (
        <EmptyState
          emoji="🧭"
          title="Nowhere fits that yet"
          description="Try lifting the nightly budget or allowing a longer flight — the cheapest places on the list are also the furthest away."
          action={<Button onClick={resetAll}>Reset filters</Button>}
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {results.map((destination, index) => (
            <DestinationCard
              key={destination.id}
              destination={destination}
              index={index}
              saved={savedIds.has(destination.id)}
              onToggleSaved={() => void toggleSaved(destination.id)}
              featured={index === 0 && sort === 'featured' && !isFiltered}
            />
          ))}
        </div>
      )}
    </div>
  )
}
