import { useMemo, useState } from 'react'
import { ACTIVITIES, CATEGORY_META, PRICE_TIER_LABEL, TIME_OF_DAY_META } from '@/lib/data'
import { formatDistance, formatPrice, pluralize } from '@/lib/format'
import type { Category, PriceTier, TimeOfDay } from '@/lib/types'
import type { AppState } from '@/lib/useAppState'
import { cx } from '@/lib/cx'
import { ActivityCard } from '@/components/ActivityCard'
import { SlidersIcon, XIcon } from '@/components/icons'
import { Badge, Button, Chip, EmptyState, SectionHeader } from '@/components/ui'

type SortKey = 'recommended' | 'price-asc' | 'price-desc' | 'rating' | 'duration' | 'distance'

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Highest rated' },
  { value: 'duration', label: 'Shortest first' },
  { value: 'distance', label: 'Closest first' },
]

const MAX_DISTANCE_KM = 40
const CATEGORY_IDS = Object.keys(CATEGORY_META) as Category[]
const TIME_IDS = Object.keys(TIME_OF_DAY_META) as TimeOfDay[]
const PRICE_TIERS: PriceTier[] = [0, 1, 2, 3]

interface Filters {
  query: string
  categories: Set<Category>
  times: Set<TimeOfDay>
  maxPriceTier: PriceTier
  maxDistance: number
  minRating: number
  outdoorOnly: boolean
}

const EMPTY_FILTERS: Filters = {
  query: '',
  categories: new Set(),
  times: new Set(),
  maxPriceTier: 3,
  maxDistance: MAX_DISTANCE_KM,
  minRating: 0,
  outdoorOnly: false,
}

function countActive(filters: Filters): number {
  let count = 0
  if (filters.query.trim()) count += 1
  count += filters.categories.size
  count += filters.times.size
  if (filters.maxPriceTier < 3) count += 1
  if (filters.maxDistance < MAX_DISTANCE_KM) count += 1
  if (filters.minRating > 0) count += 1
  if (filters.outdoorOnly) count += 1
  return count
}

/* -------------------------------------------------------------------------- */
/* Range slider                                                                */
/* -------------------------------------------------------------------------- */

function RangeField({
  label,
  value,
  displayValue,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  displayValue: string
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  const percent = ((value - min) / (max - min)) * 100

  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-ink-900">{label}</span>
        <span className="text-sm font-semibold text-bloom-600 tabular-nums">{displayValue}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2.5 h-1.5 w-full cursor-pointer appearance-none rounded-full outline-offset-4
          [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-sun-500
          [&::-webkit-slider-thumb]:shadow-mid [&::-webkit-slider-thumb]:transition-transform
          hover:[&::-webkit-slider-thumb]:scale-110
          [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2
          [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-sun-500"
        style={{
          background: `linear-gradient(to right, var(--color-sun-400) 0%, var(--color-bloom-400) ${percent}%, var(--color-ink-200) ${percent}%, var(--color-ink-200) 100%)`,
        }}
      />
    </label>
  )
}

/* -------------------------------------------------------------------------- */
/* Filter panel                                                                */
/* -------------------------------------------------------------------------- */

function FilterPanel({
  filters,
  setFilters,
  resultCount,
}: {
  filters: Filters
  setFilters: (next: Filters) => void
  resultCount: number
}) {
  const toggleCategory = (category: Category) => {
    const categories = new Set(filters.categories)
    if (categories.has(category)) categories.delete(category)
    else categories.add(category)
    setFilters({ ...filters, categories })
  }

  const toggleTime = (time: TimeOfDay) => {
    const times = new Set(filters.times)
    if (times.has(time)) times.delete(time)
    else times.add(time)
    setFilters({ ...filters, times })
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2.5 text-sm font-semibold text-ink-900">Price</p>
        <div className="flex flex-wrap gap-2">
          {PRICE_TIERS.map((tier) => (
            <Chip
              key={tier}
              selected={filters.maxPriceTier === tier}
              onClick={() => setFilters({ ...filters, maxPriceTier: tier })}
            >
              {tier === 0 ? 'Free only' : `${PRICE_TIER_LABEL[tier]} or less`}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2.5 text-sm font-semibold text-ink-900">Time of day</p>
        <div className="flex flex-wrap gap-2">
          {TIME_IDS.map((time) => (
            <Chip key={time} selected={filters.times.has(time)} onClick={() => toggleTime(time)}>
              {TIME_OF_DAY_META[time].label}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2.5 text-sm font-semibold text-ink-900">Category</p>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_IDS.map((category) => (
            <Chip
              key={category}
              selected={filters.categories.has(category)}
              onClick={() => toggleCategory(category)}
            >
              <span aria-hidden>{CATEGORY_META[category].emoji}</span>
              {CATEGORY_META[category].label}
            </Chip>
          ))}
        </div>
      </div>

      <RangeField
        label="Max distance"
        value={filters.maxDistance}
        displayValue={
          filters.maxDistance >= MAX_DISTANCE_KM ? 'Anywhere' : formatDistance(filters.maxDistance)
        }
        min={1}
        max={MAX_DISTANCE_KM}
        step={1}
        onChange={(maxDistance) => setFilters({ ...filters, maxDistance })}
      />

      <RangeField
        label="Minimum rating"
        value={filters.minRating}
        displayValue={filters.minRating === 0 ? 'Any' : `${filters.minRating.toFixed(1)}+`}
        min={0}
        max={4.9}
        step={0.1}
        onChange={(minRating) => setFilters({ ...filters, minRating })}
      />

      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-petal bg-sand/70 p-3.5">
        <span className="text-sm font-medium text-ink-900">Outdoors only</span>
        <span className="relative inline-flex">
          <input
            type="checkbox"
            checked={filters.outdoorOnly}
            onChange={(event) => setFilters({ ...filters, outdoorOnly: event.target.checked })}
            className="peer size-0 opacity-0"
          />
          <span
            className={cx(
              'block h-6 w-11 rounded-full transition-colors duration-200',
              'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-bloom-500',
              filters.outdoorOnly ? 'bg-lagoon-500' : 'bg-ink-300',
            )}
          />
          <span
            className={cx(
              'pointer-events-none absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-low transition-transform duration-200',
              filters.outdoorOnly && 'translate-x-5',
            )}
          />
        </span>
      </label>

      <p className="border-t border-ink-100 pt-4 text-sm text-ink-700">
        <span className="font-semibold text-ink-900">{resultCount}</span>{' '}
        {pluralize(resultCount, 'result')}
      </p>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Explore                                                                     */
/* -------------------------------------------------------------------------- */

export function Explore({ state }: { state: AppState }) {
  const { saved, scheduledActivityIds, toggleSaved, addToDay } = state
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [sort, setSort] = useState<SortKey>('recommended')
  const [panelOpen, setPanelOpen] = useState(false)

  const activeCount = countActive(filters)

  const results = useMemo(() => {
    const query = filters.query.trim().toLowerCase()

    const filtered = ACTIVITIES.filter((activity) => {
      if (activity.priceTier > filters.maxPriceTier) return false
      if (activity.distanceKm > filters.maxDistance) return false
      if (activity.rating < filters.minRating) return false
      if (filters.outdoorOnly && !activity.outdoor) return false
      if (filters.categories.size > 0 && !filters.categories.has(activity.category)) return false
      if (
        filters.times.size > 0 &&
        !activity.timeOfDay.some((time) => filters.times.has(time))
      ) {
        return false
      }
      if (query) {
        const haystack = [
          activity.title,
          activity.place,
          activity.neighborhood,
          activity.blurb,
          ...activity.tags,
        ]
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(query)) return false
      }
      return true
    })

    const sorted = [...filtered]
    switch (sort) {
      case 'price-asc':
        sorted.sort((a, b) => a.price - b.price)
        break
      case 'price-desc':
        sorted.sort((a, b) => b.price - a.price)
        break
      case 'rating':
        sorted.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount)
        break
      case 'duration':
        sorted.sort((a, b) => a.durationMin - b.durationMin)
        break
      case 'distance':
        sorted.sort((a, b) => a.distanceKm - b.distanceKm)
        break
      default:
        // Recommended: rating weighted by how many people rated it
        sorted.sort(
          (a, b) => b.rating * Math.log10(b.reviewCount + 10) - a.rating * Math.log10(a.reviewCount + 10),
        )
    }
    return sorted
  }, [filters, sort])

  const cheapest = useMemo(
    () => results.reduce((min, activity) => Math.min(min, activity.price), Infinity),
    [results],
  )

  return (
    <div className="space-y-7">
      <SectionHeader
        eyebrow="Things to do"
        title="What are we doing today?"
        description="Twenty-four ideas within an hour of the coast. Filter by what you feel like spending, how far you will go, and when you want to be out."
      />

      {/* Search + sort */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Own row on narrow screens; shares the row with Sort from sm up */}
        <div className="relative w-full sm:w-auto sm:min-w-56 sm:flex-1">
          <input
            type="search"
            value={filters.query}
            onChange={(event) => setFilters({ ...filters, query: event.target.value })}
            placeholder="Search tacos, flowers, sauna…"
            aria-label="Search things to do"
            className="h-11 w-full rounded-full bg-shell pr-4 pl-11 text-sm text-ink-900 ring-1 ring-ink-200 ring-inset shadow-low transition placeholder:text-ink-400 hover:ring-sun-300 focus:ring-2 focus:ring-bloom-400 focus:outline-none"
          />
          <span
            className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-400"
            aria-hidden
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="size-4">
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l4.5 4.5" strokeLinecap="round" />
            </svg>
          </span>
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

        <Button
          variant="secondary"
          className="lg:hidden"
          onClick={() => setPanelOpen((open) => !open)}
          aria-expanded={panelOpen}
        >
          <SlidersIcon className="size-4" />
          Filters
          {activeCount > 0 && (
            <span className="ml-1 grid size-5 place-items-center rounded-full bg-bloom-500 text-[0.6875rem] font-semibold text-white">
              {activeCount}
            </span>
          )}
        </Button>

        {activeCount > 0 && (
          <Button variant="ghost" onClick={() => setFilters(EMPTY_FILTERS)}>
            <XIcon className="size-4" />
            Reset
          </Button>
        )}
      </div>

      <div className="flex gap-8">
        {/* Sidebar filters on large screens */}
        <aside className="hidden w-72 shrink-0 lg:block">
          <div className="sticky top-24 rounded-shell bg-shell p-5 ring-1 ring-ink-200/70 ring-inset shadow-low">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-base font-semibold text-ink-900">Filters</h3>
              {activeCount > 0 && <Badge tone="bloom">{activeCount} active</Badge>}
            </div>
            <FilterPanel filters={filters} setFilters={setFilters} resultCount={results.length} />
          </div>
        </aside>

        <div className="min-w-0 flex-1 space-y-5">
          {/* Collapsible filters on small screens */}
          {panelOpen && (
            <div className="rounded-shell bg-shell p-5 ring-1 ring-ink-200/70 ring-inset shadow-mid lg:hidden">
              <FilterPanel filters={filters} setFilters={setFilters} resultCount={results.length} />
            </div>
          )}

          {results.length > 0 && (
            <p className="text-sm text-ink-700">
              <span className="font-semibold text-ink-900">{results.length}</span>{' '}
              {pluralize(results.length, 'idea')}
              {cheapest !== Infinity && (
                <> · from {cheapest === 0 ? 'free' : formatPrice(cheapest)}</>
              )}
            </p>
          )}

          {results.length === 0 ? (
            <EmptyState
              emoji="🪺"
              title="Nothing matches that combination"
              description="The filters have squeezed everything out. Loosen the price cap or widen the distance and there will be plenty again."
              action={<Button onClick={() => setFilters(EMPTY_FILTERS)}>Reset filters</Button>}
            />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {results.map((activity, index) => (
                <ActivityCard
                  key={activity.id}
                  activity={activity}
                  index={index}
                  saved={saved.has(activity.id)}
                  scheduled={scheduledActivityIds.has(activity.id)}
                  onToggleSaved={() => toggleSaved(activity.id)}
                  onAdd={() => addToDay(activity)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
