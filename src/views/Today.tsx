import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import type { DayItem, Place } from '@/lib/api'
import { CATEGORY_META } from '@/lib/data'
import { formatDistance, formatDuration, formatTime, pluralize } from '@/lib/format'
import { cx } from '@/lib/cx'
import { DAY_END_MIN, DAY_START_MIN, type AppState } from '@/lib/useAppState'
import { AuthPanel } from '@/components/AuthPanel'
import { ClockIcon, PinIcon, TrashIcon, XIcon } from '@/components/icons'
import { Badge, Button, EmptyState } from '@/components/ui'

const PX_PER_MIN = 1.2
const RAIL_START = DAY_START_MIN
const RAIL_END = DAY_END_MIN

const STRIPE: Record<string, string> = {
  sun: 'bg-sun-400',
  bloom: 'bg-bloom-400',
  lagoon: 'bg-lagoon-300',
}

interface Resolved {
  item: DayItem
  place: Place
  endMin: number
}

function useCurrentMinute() {
  const [minute, setMinute] = useState(() => {
    const now = new Date()
    return now.getHours() * 60 + now.getMinutes()
  })

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date()
      setMinute(now.getHours() * 60 + now.getMinutes())
    }, 60_000)
    return () => clearInterval(timer)
  }, [])

  return minute
}

function greetingFor(minute: number): string {
  if (minute < 12 * 60) return 'Good morning'
  if (minute < 17 * 60) return 'Good afternoon'
  return 'Good evening'
}

/* -------------------------------------------------------------------------- */
/* Sun arc                                                                     */
/* -------------------------------------------------------------------------- */

function SunArc({ minute }: { minute: number }) {
  const from = 6 * 60
  const to = 20 * 60
  const progress = Math.min(1, Math.max(0, (minute - from) / (to - from)))
  const angle = Math.PI * (1 - progress)
  const x = 90 + 80 * Math.cos(angle)
  const y = 70 - 55 * Math.sin(angle)

  return (
    <svg viewBox="0 0 180 84" className="h-20 w-44" aria-hidden focusable="false">
      <defs>
        <linearGradient id="arc-track" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#FFB8D0" />
          <stop offset="50%" stopColor="#FFC820" />
          <stop offset="100%" stopColor="#FB6C9C" />
        </linearGradient>
      </defs>
      <path d="M 10 70 A 80 55 0 0 1 170 70" fill="none" stroke="#F5ECDD" strokeWidth="3" strokeLinecap="round" />
      <path
        d="M 10 70 A 80 55 0 0 1 170 70"
        fill="none"
        stroke="url(#arc-track)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="260"
        strokeDashoffset={260 - 260 * progress}
      />
      <line x1="6" y1="70" x2="174" y2="70" stroke="#ECE0CD" strokeWidth="2" strokeLinecap="round" />
      <circle cx={x} cy={y} r="11" fill="#FFC820" opacity="0.28" />
      <circle cx={x} cy={y} r="6" fill="#F2AC00" />
    </svg>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-petal bg-shell/70 p-4 ring-1 ring-ink-200/60 ring-inset">
      <p className="text-xs font-medium tracking-wide text-ink-500 uppercase">{label}</p>
      <p className="mt-1.5 font-display text-2xl font-semibold text-ink-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-500">{hint}</p>}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Timeline item                                                               */
/* -------------------------------------------------------------------------- */

function TimelineItem({
  resolved,
  onRemove,
  onMove,
  isNow,
}: {
  resolved: Resolved
  onRemove: () => void
  onMove: (delta: number) => void
  isNow: boolean
}) {
  const { item, place, endMin } = resolved
  const category = CATEGORY_META[place.category]
  const height = Math.max(place.durationMin * PX_PER_MIN, 72)

  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      style={{ top: (item.startMin - RAIL_START) * PX_PER_MIN, height }}
      className="absolute inset-x-0 flex"
    >
      <div
        className={cx(
          'group relative flex w-full gap-3 overflow-hidden rounded-petal bg-shell p-3.5 pl-4',
          'ring-1 ring-inset shadow-low transition-all duration-200 hover:shadow-mid',
          isNow ? 'ring-2 ring-bloom-400' : 'ring-ink-200/70',
        )}
      >
        <span
          className={cx('absolute inset-y-0 left-0 w-1.5', STRIPE[category.hue] ?? 'bg-sun-400')}
          aria-hidden
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="font-display text-sm font-semibold text-ink-900 tabular-nums">
              {formatTime(item.startMin)} – {formatTime(endMin)}
            </p>
            {isNow && (
              <Badge tone="bloom" className="text-[0.625rem]">
                Now
              </Badge>
            )}
          </div>

          <h3 className="mt-0.5 truncate text-[0.9375rem] font-semibold text-ink-900">
            {place.name}
          </h3>

          {height > 92 && (place.neighborhood || place.distanceKm !== undefined) && (
            <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-ink-700">
              <PinIcon className="size-3.5 shrink-0 text-bloom-400" />
              {[place.neighborhood, place.distanceKm !== undefined && formatDistance(place.distanceKm)]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}

          {height > 130 && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-700">
              <Badge tone="sun">
                <span aria-hidden>{category.emoji}</span>
                {category.label}
              </Badge>
              {place.openingHours && <span className="truncate">· {place.openingHours}</span>}
            </div>
          )}
        </div>

        <div className="hidden shrink-0 flex-col items-end justify-center gap-0.5 pr-1 text-right sm:flex">
          <span className="font-display text-base font-semibold text-ink-900">
            ~{formatDuration(place.durationMin)}
          </span>
          {place.fee === false && <span className="text-xs text-lagoon-600">free</span>}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onMove(-30)}
              aria-label={`Move ${place.name} 30 minutes earlier`}
              className="grid size-7 place-items-center rounded-full text-ink-500 transition-colors hover:bg-sun-100 hover:text-ink-900"
            >
              <span aria-hidden className="text-sm leading-none">
                ↑
              </span>
            </button>
            <button
              type="button"
              onClick={() => onMove(30)}
              aria-label={`Move ${place.name} 30 minutes later`}
              className="grid size-7 place-items-center rounded-full text-ink-500 transition-colors hover:bg-sun-100 hover:text-ink-900"
            >
              <span aria-hidden className="text-sm leading-none">
                ↓
              </span>
            </button>
          </div>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${place.name} from your day`}
            className="grid size-7 place-items-center rounded-full text-ink-500 transition-colors hover:bg-bloom-100 hover:text-bloom-600"
          >
            <TrashIcon className="size-4" />
          </button>
        </div>
      </div>
    </motion.li>
  )
}

/* -------------------------------------------------------------------------- */
/* Today                                                                       */
/* -------------------------------------------------------------------------- */

export function Today({ state }: { state: AppState }) {
  const {
    user,
    authStatus,
    dayItems,
    placeById,
    removeFromDay,
    moveInDay,
    clearDay,
    setView,
    locationLabel,
  } = state
  const currentMinute = useCurrentMinute()

  const resolved = useMemo<Resolved[]>(
    () =>
      dayItems
        .map((item) => {
          const place = placeById.get(item.placeId)
          return place ? { item, place, endMin: item.startMin + place.durationMin } : null
        })
        .filter((entry): entry is Resolved => entry !== null)
        .sort((a, b) => a.item.startMin - b.item.startMin),
    [dayItems, placeById],
  )

  const totals = useMemo(() => {
    const bookedMin = resolved.reduce((sum, entry) => sum + entry.place.durationMin, 0)
    const freeKnown = resolved.filter((entry) => entry.place.fee === false).length
    return { bookedMin, freeKnown }
  }, [resolved])

  const gaps = useMemo(() => {
    const found: Array<{ start: number; end: number }> = []
    let cursor = RAIL_START

    for (const entry of resolved) {
      if (entry.item.startMin - cursor >= 45) {
        found.push({ start: cursor, end: entry.item.startMin })
      }
      cursor = Math.max(cursor, entry.endMin)
    }
    if (RAIL_END - cursor >= 90 && resolved.length > 0) {
      found.push({ start: cursor, end: RAIL_END })
    }
    return found
  }, [resolved])

  const hours = useMemo(() => {
    const list: number[] = []
    for (let minute = RAIL_START; minute <= RAIL_END; minute += 60) list.push(minute)
    return list
  }, [])

  const railHeight = (RAIL_END - RAIL_START) * PX_PER_MIN
  const nowInsideItem = resolved.some(
    (entry) => currentMinute >= entry.item.startMin && currentMinute < entry.endMin,
  )
  const nowVisible = currentMinute >= RAIL_START && currentMinute <= RAIL_END && !nowInsideItem
  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  if (authStatus === 'loading') {
    return <div className="h-96 animate-pulse rounded-dune bg-sand/60" />
  }

  if (!user) {
    return (
      <div className="space-y-8">
        <section className="relative overflow-hidden rounded-dune bg-sunrise p-6 ring-1 ring-white/70 ring-inset shadow-low sm:p-10">
          <div
            className="pointer-events-none absolute -top-16 -right-10 size-56 rounded-full bg-bloom-200/45 blur-3xl animate-sway"
            aria-hidden
          />
          <div className="relative">
            <p className="text-xs font-semibold tracking-[0.16em] text-bloom-500 uppercase">
              {dateLabel}
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold text-ink-900 sm:text-[2.75rem] sm:leading-[1.1]">
              Your day, <span className="text-sunrise">in the sun</span>
            </h1>
            <p className="mt-3 max-w-lg text-sm text-ink-700 sm:text-base">
              Sign in to plan a day and keep your saved places. Browsing what's nearby needs no
              account at all.
            </p>
            <div className="mt-5">
              <Button variant="secondary" onClick={() => setView('explore')}>
                Just show me what's nearby
              </Button>
            </div>
          </div>
        </section>

        <AuthPanel
          state={state}
          heading="Plan your day"
          description="Your schedule and saved places live in Sundial's own database, tied to your account."
        />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-dune bg-sunrise p-6 ring-1 ring-white/70 ring-inset shadow-low sm:p-8">
        <div
          className="pointer-events-none absolute -top-16 -right-10 size-56 rounded-full bg-bloom-200/45 blur-3xl animate-sway"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-20 left-1/3 size-48 rounded-full bg-sun-200/50 blur-3xl"
          aria-hidden
        />

        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-bloom-500 uppercase">
              {dateLabel}
              {locationLabel && ` · ${locationLabel}`}
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold text-ink-900 sm:text-[2.75rem] sm:leading-[1.1]">
              {greetingFor(currentMinute)},{' '}
              <span className="text-sunrise">{user.displayName}</span>
            </h1>
            <p className="mt-3 max-w-md text-sm text-ink-700 sm:text-base">
              {resolved.length === 0
                ? 'Nothing planned yet. Go find something worth leaving the house for.'
                : `${resolved.length} ${pluralize(resolved.length, 'thing')} lined up, about ${formatDuration(
                    totals.bookedMin,
                  )} of it.`}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button onClick={() => setView('explore')}>Find something to do</Button>
              {resolved.length > 0 && (
                <Button variant="ghost" onClick={() => void clearDay()}>
                  <XIcon className="size-4" />
                  Clear day
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-col items-center">
            <SunArc minute={currentMinute} />
            <p className="mt-1 text-xs font-medium text-ink-700 tabular-nums">
              {formatTime(currentMinute)}
            </p>
          </div>
        </div>

        <dl className="relative mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Planned"
            value={`${resolved.length}`}
            hint={pluralize(resolved.length, 'place')}
          />
          <Stat label="Time out" value={formatDuration(totals.bookedMin)} hint="estimated" />
          <Stat label="Known free" value={`${totals.freeKnown}`} hint="no entry fee" />
          <Stat
            label="Unplanned"
            value={formatDuration(Math.max(0, RAIL_END - RAIL_START - totals.bookedMin))}
            hint="of 6am–midnight"
          />
        </dl>
      </section>

      <section>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-ink-900">Your day</h2>
            <p className="mt-1.5 text-sm text-ink-700">
              Hover an item to nudge it half an hour either way, or drop it entirely.
            </p>
          </div>
          <Badge tone="lagoon">
            <ClockIcon className="size-3.5" />
            6am – midnight
          </Badge>
        </div>

        {resolved.length === 0 ? (
          <EmptyState
            emoji="🌻"
            title="A completely open day"
            description="That is either a problem or a luxury. Either way, Explore lists real places near you, closest first."
            action={<Button onClick={() => setView('explore')}>Browse what's nearby</Button>}
          />
        ) : (
          <div className="rounded-shell bg-sand/50 p-4 ring-1 ring-ink-200/60 ring-inset sm:p-6">
            <div className="relative pl-14 sm:pl-16" style={{ height: railHeight }}>
              {hours.map((minute) => (
                <div
                  key={minute}
                  className="absolute inset-x-0 flex items-center gap-3"
                  style={{ top: (minute - RAIL_START) * PX_PER_MIN }}
                >
                  <span className="absolute -left-14 w-12 text-right text-[0.6875rem] font-medium text-ink-500 tabular-nums sm:-left-16 sm:w-14">
                    {formatTime(minute)}
                  </span>
                  <span className="h-px flex-1 bg-ink-200/70" aria-hidden />
                </div>
              ))}

              {gaps.map((gap) => (
                <button
                  key={`${gap.start}-${gap.end}`}
                  type="button"
                  onClick={() => setView('explore')}
                  style={{
                    top: (gap.start - RAIL_START) * PX_PER_MIN + 4,
                    height: (gap.end - gap.start) * PX_PER_MIN - 8,
                  }}
                  className="group absolute inset-x-0 grid place-items-center rounded-petal border border-dashed border-ink-300 text-xs text-ink-500 transition-colors duration-200 hover:border-bloom-300 hover:bg-bloom-50/70 hover:text-bloom-600"
                >
                  <span className="px-3 text-center">
                    {formatDuration(gap.end - gap.start)} free
                    <span className="hidden group-hover:inline"> · find something</span>
                  </span>
                </button>
              ))}

              {nowVisible && (
                <div
                  className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
                  style={{ top: (currentMinute - RAIL_START) * PX_PER_MIN }}
                  aria-hidden
                >
                  <span className="size-2.5 shrink-0 rounded-full bg-bloom-500 ring-4 ring-bloom-200/60" />
                  <span className="ml-2 shrink-0 rounded-full bg-bloom-500 px-2 py-0.5 text-[0.625rem] font-semibold tracking-wide text-white uppercase shadow-low">
                    now
                  </span>
                  <span className="ml-2 h-0.5 flex-1 bg-gradient-to-r from-bloom-400 to-transparent" />
                </div>
              )}

              <ul className="absolute inset-0 z-10 list-none p-0">
                {resolved.map((entry) => (
                  <TimelineItem
                    key={entry.item.id}
                    resolved={entry}
                    isNow={currentMinute >= entry.item.startMin && currentMinute < entry.endMin}
                    onRemove={() => void removeFromDay(entry.item.id)}
                    onMove={(delta) => void moveInDay(entry.item.id, delta)}
                  />
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
