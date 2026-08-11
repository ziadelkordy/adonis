import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import type { DayItem, Place, ScheduledEvent } from '@/lib/api'
import { CATEGORY_META } from '@/lib/data'
import { formatDistance, formatDuration, formatTime, pluralize } from '@/lib/format'
import { dayForecast, rainChanceAt, useForecast } from '@/lib/useForecast'
import { cx } from '@/lib/cx'
import { describeDate, describeDateInline, shiftDate, todayISO } from '@/lib/router'
import { DAY_END_MIN, DAY_START_MIN, type AppState } from '@/lib/useAppState'
import { AuthPanel } from '@/components/AuthPanel'
import { WeatherStrip } from '@/components/WeatherStrip'
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

/**
 * A scheduled item flattened into what the timeline draws, so the row component
 * doesn't have to branch on place-versus-event in six places.
 */
interface Entry {
  item: DayItem
  startMin: number
  endMin: number
  durationMin: number
  title: string
  where: string | null
  kindLabel: string
  kindEmoji: string
  hue: string
  detail: string | null
  /** Whether rain would actually spoil this — drives the forecast warning. */
  isOutdoor: boolean
  /** Places open the detail panel; events link out to the provider. */
  placeId: string | null
  href: string | null
}

function priceLabel(event: ScheduledEvent): string | null {
  const { priceMin, priceMax, currency } = event
  if (priceMin === null && priceMax === null) return null
  const symbol = currency === 'USD' ? '$' : currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : ''
  const round = (value: number) => (Number.isInteger(value) ? value : value.toFixed(2))
  if (priceMin !== null && priceMax !== null && priceMin !== priceMax) {
    return `${symbol}${round(priceMin)}–${symbol}${round(priceMax)}`
  }
  const single = priceMin ?? priceMax
  return single === null ? null : `from ${symbol}${round(single)}`
}

function entryForPlace(item: DayItem, place: Place): Entry {
  const category = CATEGORY_META[place.category]
  return {
    item,
    startMin: item.startMin,
    endMin: item.startMin + place.durationMin,
    durationMin: place.durationMin,
    title: place.name,
    where: [place.neighborhood, place.distanceKm !== undefined && formatDistance(place.distanceKm)]
      .filter(Boolean)
      .join(' · ') || null,
    kindLabel: category.label,
    kindEmoji: category.emoji,
    hue: category.hue,
    detail: place.openingHours,
    isOutdoor: place.category === 'outdoors' || place.category === 'water',
    placeId: place.id,
    href: null,
  }
}

function entryForEvent(item: DayItem, event: ScheduledEvent): Entry {
  return {
    // Neither ESPN nor a ticket listing says whether a venue is open-air, and
    // guessing would warn about rain at indoor arenas.
    isOutdoor: false,
    item,
    startMin: item.startMin,
    endMin: item.startMin + event.durationMin,
    durationMin: event.durationMin,
    title: event.name,
    where: [event.venueName, event.city].filter(Boolean).join(' · ') || null,
    kindLabel: event.genre ?? event.segment ?? 'Event',
    kindEmoji: event.segment === 'Sports' ? '🏟️' : '🎟️',
    hue: 'bloom',
    detail: priceLabel(event),
    placeId: null,
    href: event.url,
  }
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
/* Date switcher                                                               */
/* -------------------------------------------------------------------------- */

function DateNav({ date, onChange }: { date: string; onChange: (next: string) => void }) {
  const today = todayISO()

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 rounded-full bg-shell p-1 ring-1 ring-ink-200 ring-inset shadow-low">
        <button
          type="button"
          onClick={() => onChange(shiftDate(date, -1))}
          aria-label="Previous day"
          className="grid size-8 place-items-center rounded-full text-ink-700 transition-colors hover:bg-sun-100 hover:text-ink-900"
        >
          <span aria-hidden>←</span>
        </button>
        <span className="min-w-32 px-2 text-center text-sm font-semibold text-ink-900">
          {describeDate(date)}
        </span>
        <button
          type="button"
          onClick={() => onChange(shiftDate(date, 1))}
          aria-label="Next day"
          className="grid size-8 place-items-center rounded-full text-ink-700 transition-colors hover:bg-sun-100 hover:text-ink-900"
        >
          <span aria-hidden>→</span>
        </button>
      </div>

      {date !== today && (
        <Button variant="ghost" size="sm" onClick={() => onChange(today)}>
          Jump to today
        </Button>
      )}

      {/* A native picker beats reinventing a calendar. */}
      <label className="flex items-center gap-2">
        <span className="sr-only">Pick a date</span>
        <input
          type="date"
          value={date}
          onChange={(event) => event.target.value && onChange(event.target.value)}
          className="h-9 rounded-full bg-shell px-3 text-sm text-ink-900 ring-1 ring-ink-200 ring-inset shadow-low transition hover:ring-sun-300 focus:ring-2 focus:ring-bloom-400 focus:outline-none"
        />
      </label>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Timeline item                                                               */
/* -------------------------------------------------------------------------- */

/** Drag snaps to quarter hours — the same grid the auto-planner uses. */
const SNAP_MIN = 15

function TimelineItem({
  entry,
  onRemove,
  onMove,
  onOpen,
  isNow,
  rainChance,
}: {
  entry: Entry
  onRemove: () => void
  onMove: (delta: number) => void
  onOpen: () => void
  isNow: boolean
  /** Set only for outdoor items at an hour where rain is actually likely. */
  rainChance: number | null
}) {
  const height = Math.max(entry.durationMin * PX_PER_MIN, 72)
  const interactive = entry.placeId !== null

  /*
   * Only worth interrupting someone for when rain is more likely than not at the
   * hour they've planned. A badge on every 30% afternoon is noise, and noise here
   * teaches people to ignore the one warning that mattered.
   */
  const rainWarning = rainChance !== null && rainChance >= 50 ? rainChance : null

  /*
   * Drag to reschedule.
   *
   * Pointer events rather than HTML5 drag-and-drop: they cover mouse, touch and
   * pen with one code path, and give pointer capture so the drag survives the
   * cursor leaving the card. The ±30 buttons stay — they're the keyboard route,
   * and dragging is an enhancement, not a replacement.
   */
  const dragOrigin = useRef<{ y: number; pointerId: number } | null>(null)
  const [dragMinutes, setDragMinutes] = useState<number | null>(null)
  const isDragging = dragMinutes !== null

  const minutesFrom = (clientY: number): number => {
    const origin = dragOrigin.current
    if (!origin) return 0
    return Math.round((clientY - origin.y) / PX_PER_MIN / SNAP_MIN) * SNAP_MIN
  }

  const beginDrag = (event: React.PointerEvent<HTMLElement>) => {
    // Never start a drag from a control; those clicks must still land.
    if ((event.target as HTMLElement).closest('button, a, input')) return

    /*
     * Touch drags only start from the grip. Making the whole card touch-draggable
     * needs `touch-action: none` on it, which would stop the page scrolling
     * wherever a card happens to be under your thumb.
     */
    const fromGrip = Boolean((event.target as HTMLElement).closest('[data-drag-grip]'))
    if (event.pointerType !== 'mouse' && !fromGrip) return

    dragOrigin.current = { y: event.clientY, pointerId: event.pointerId }
    setDragMinutes(0)

    /*
     * Listeners go on `window`, not on this element via React props.
     *
     * The obvious version — onPointerMove on the motion.li — silently never fired:
     * the drag would start and then nothing moved. Native listeners are immune to
     * whatever retargeting pointer capture and the animation library's own gesture
     * handling do between them, and they keep working when the cursor leaves the
     * card, which is the whole point during a drag.
     */
    const onPointerMove = (native: PointerEvent) => {
      if (native.pointerId !== event.pointerId) return
      setDragMinutes(minutesFrom(native.clientY))
    }

    const finish = (native: PointerEvent, commit: boolean) => {
      if (native.pointerId !== event.pointerId) return
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)

      // Read the delta off the event, not off state — state here would be stale.
      const delta = commit ? minutesFrom(native.clientY) : 0
      dragOrigin.current = null
      setDragMinutes(null)
      // A click without movement shouldn't fire a pointless request.
      if (delta !== 0) onMove(delta)
    }

    const onUp = (native: PointerEvent) => finish(native, true)
    const onCancel = (native: PointerEvent) => finish(native, false)

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }

  const offsetMin = dragMinutes ?? 0
  const previewStart = entry.startMin + offsetMin
  const previewEnd = entry.endMin + offsetMin

  return (
    <motion.li
      // `layout` fights a live drag for control of `top`, so it's off mid-drag.
      layout={!isDragging}
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      onPointerDown={beginDrag}
      style={{
        top: (previewStart - RAIL_START) * PX_PER_MIN,
        height,
        zIndex: isDragging ? 30 : undefined,
      }}
      className="absolute inset-x-0 flex"
    >
      <div
        className={cx(
          'group relative flex w-full gap-3 overflow-hidden rounded-petal bg-shell p-3.5 pl-4',
          'ring-1 ring-inset transition-shadow duration-200',
          isDragging
            ? 'cursor-grabbing shadow-high ring-2 ring-bloom-400'
            : 'cursor-grab shadow-low hover:shadow-mid',
          isNow && !isDragging ? 'ring-2 ring-bloom-400' : !isDragging && 'ring-ink-200/70',
        )}
      >
        <span
          className={cx('absolute inset-y-0 left-0 w-1.5', STRIPE[entry.hue] ?? 'bg-sun-400')}
          aria-hidden
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p
              className={cx(
                'font-display text-sm font-semibold tabular-nums',
                isDragging ? 'text-bloom-600' : 'text-ink-900',
              )}
            >
              {formatTime(previewStart)} – {formatTime(previewEnd)}
            </p>
            {isDragging && offsetMin !== 0 && (
              <span className="text-xs font-medium text-bloom-500 tabular-nums">
                {offsetMin > 0 ? '+' : '−'}
                {formatDuration(Math.abs(offsetMin))}
              </span>
            )}
            {isNow && (
              <Badge tone="bloom" className="text-[0.625rem]">
                Now
              </Badge>
            )}
          </div>

          {/* Places open their detail panel; events aren't places, so they link out. */}
          {interactive ? (
            <button
              type="button"
              onClick={onOpen}
              className="mt-0.5 block max-w-full truncate text-left text-[0.9375rem] font-semibold text-ink-900 hover:text-bloom-600 hover:underline"
            >
              {entry.title}
            </button>
          ) : (
            <h3 className="mt-0.5 truncate text-[0.9375rem] font-semibold text-ink-900">
              {entry.title}
            </h3>
          )}

          {height > 92 && entry.where && (
            <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-ink-700">
              <PinIcon className="size-3.5 shrink-0 text-bloom-400" />
              {entry.where}
            </p>
          )}

          {height > 130 && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-700">
              <Badge tone={entry.hue === 'bloom' ? 'bloom' : 'sun'}>
                <span aria-hidden>{entry.kindEmoji}</span>
                {entry.kindLabel}
              </Badge>
              {rainWarning !== null && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-lagoon-50 px-2 py-0.5 font-semibold text-lagoon-600 ring-1 ring-lagoon-300/60 ring-inset">
                  <span aria-hidden>💧</span>
                  {rainWarning}% rain at this hour
                </span>
              )}
              {entry.detail && <span className="truncate">{entry.detail}</span>}
            </div>
          )}
        </div>

        <div className="hidden shrink-0 flex-col items-end justify-center gap-0.5 pr-1 text-right sm:flex">
          <span className="font-display text-base font-semibold text-ink-900">
            ~{formatDuration(entry.durationMin)}
          </span>
          {entry.href && (
            <a
              href={entry.href}
              target="_blank"
              rel="noreferrer noopener"
              className="text-xs font-medium text-bloom-600 hover:underline"
            >
              Details
            </a>
          )}
        </div>

        {/* Touch-drag handle. `touch-action: none` is confined to this, so the
            page still scrolls everywhere else on the card. */}
        <span
          data-drag-grip
          aria-hidden
          title="Drag to reschedule"
          className={cx(
            'flex shrink-0 cursor-grab touch-none items-center self-stretch px-1',
            'text-ink-300 transition-colors group-hover:text-ink-500',
            isDragging && 'text-bloom-400',
          )}
        >
          <svg viewBox="0 0 8 16" className="h-5 w-2" fill="currentColor" focusable="false">
            <circle cx="2" cy="4" r="1.2" />
            <circle cx="6" cy="4" r="1.2" />
            <circle cx="2" cy="8" r="1.2" />
            <circle cx="6" cy="8" r="1.2" />
            <circle cx="2" cy="12" r="1.2" />
            <circle cx="6" cy="12" r="1.2" />
          </svg>
        </span>

        <div className="flex shrink-0 flex-col items-end gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onMove(-30)}
              aria-label={`Move ${entry.title} 30 minutes earlier`}
              className="grid size-7 place-items-center rounded-full text-ink-500 transition-colors hover:bg-sun-100 hover:text-ink-900"
            >
              <span aria-hidden className="text-sm leading-none">
                ↑
              </span>
            </button>
            <button
              type="button"
              onClick={() => onMove(30)}
              aria-label={`Move ${entry.title} 30 minutes later`}
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
            aria-label={`Remove ${entry.title} from your day`}
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
    eventById,
    removeFromDay,
    moveInDay,
    clearDay,
    setView,
    setDate,
    openDetail,
    date,
    locationLabel,
    coords,
  } = state
  const currentMinute = useCurrentMinute()
  const forecast = useForecast(coords.lat, coords.lon)
  const today = dayForecast(forecast, date)
  const isToday = date === todayISO()

  const entries = useMemo<Entry[]>(
    () =>
      dayItems
        .map((item) => {
          if (item.placeId) {
            const place = placeById.get(item.placeId)
            return place ? entryForPlace(item, place) : null
          }
          if (item.eventId) {
            const event = eventById.get(item.eventId)
            return event ? entryForEvent(item, event) : null
          }
          return null
        })
        .filter((entry): entry is Entry => entry !== null)
        .sort((a, b) => a.startMin - b.startMin),
    [dayItems, placeById, eventById],
  )

  const totals = useMemo(() => {
    const bookedMin = entries.reduce((sum, entry) => sum + entry.durationMin, 0)
    const eventCount = entries.filter((entry) => entry.placeId === null).length
    return { bookedMin, eventCount }
  }, [entries])

  const gaps = useMemo(() => {
    const found: Array<{ start: number; end: number }> = []
    let cursor = RAIL_START

    for (const entry of entries) {
      if (entry.startMin - cursor >= 45) found.push({ start: cursor, end: entry.startMin })
      cursor = Math.max(cursor, entry.endMin)
    }
    if (RAIL_END - cursor >= 90 && entries.length > 0) {
      found.push({ start: cursor, end: RAIL_END })
    }
    return found
  }, [entries])

  const hours = useMemo(() => {
    const list: number[] = []
    for (let minute = RAIL_START; minute <= RAIL_END; minute += 60) list.push(minute)
    return list
  }, [])

  const railHeight = (RAIL_END - RAIL_START) * PX_PER_MIN

  // The now-marker only makes sense on today, and only outside an item's own card.
  const nowInsideItem = entries.some(
    (entry) => currentMinute >= entry.startMin && currentMinute < entry.endMin,
  )
  const nowVisible =
    isToday && currentMinute >= RAIL_START && currentMinute <= RAIL_END && !nowInsideItem

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
              {describeDate(date)}
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
          description="Your schedule and saved places live in Adonis's own database, tied to your account."
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
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.16em] text-bloom-500 uppercase">
              {describeDate(date)}
              {locationLabel && ` · ${locationLabel}`}
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold text-ink-900 sm:text-[2.75rem] sm:leading-[1.1]">
              {isToday ? (
                <>
                  {greetingFor(currentMinute)},{' '}
                  <span className="text-sunrise">{user.displayName}</span>
                </>
              ) : (
                <>
                  Planning <span className="text-sunrise">{describeDateInline(date)}</span>
                </>
              )}
            </h1>
            <p className="mt-3 max-w-md text-sm text-ink-700 sm:text-base">
              {entries.length === 0
                ? 'Nothing planned yet. Go find something worth leaving the house for.'
                : `${entries.length} ${pluralize(entries.length, 'thing')} lined up, about ${formatDuration(
                    totals.bookedMin,
                  )} of it${totals.eventCount > 0 ? `, including ${totals.eventCount} ticketed` : ''}.`}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button onClick={() => setView('explore')}>Find something to do</Button>
              {entries.length > 0 && (
                <Button variant="ghost" onClick={() => void clearDay()}>
                  <XIcon className="size-4" />
                  Clear this day
                </Button>
              )}
            </div>
          </div>

          {isToday && (
            <div className="flex flex-col items-center">
              <SunArc minute={currentMinute} />
              <p className="mt-1 text-xs font-medium text-ink-700 tabular-nums">
                {formatTime(currentMinute)}
              </p>
            </div>
          )}
        </div>

        <div className="relative mt-6 space-y-3">
          <DateNav date={date} onChange={setDate} />
          {/* Only for dates the forecast actually covers — a week ahead. */}
          {today && <WeatherStrip day={today} />}
        </div>

        <dl className="relative mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Planned" value={`${entries.length}`} hint={pluralize(entries.length, 'item')} />
          <Stat label="Time out" value={formatDuration(totals.bookedMin)} hint="estimated" />
          <Stat label="Ticketed" value={`${totals.eventCount}`} hint="events" />
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
            <h2 className="text-2xl font-semibold text-ink-900">
              {isToday ? 'Your day' : describeDate(date)}
            </h2>
            <p className="mt-1.5 text-sm text-ink-700">
              Drag an item to reschedule it, or use the arrows for half-hour nudges.
            </p>
          </div>
          <Badge tone="lagoon">
            <ClockIcon className="size-3.5" />
            6am – midnight
          </Badge>
        </div>

        {entries.length === 0 ? (
          <EmptyState
            emoji="🌻"
            title={isToday ? 'A completely open day' : `Nothing planned for ${describeDateInline(date)}`}
            description="Explore lists real places near you, closest first — and real fixtures you can drop straight onto a date."
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
                {entries.map((entry) => (
                  <TimelineItem
                    key={entry.item.id}
                    entry={entry}
                    isNow={
                      isToday && currentMinute >= entry.startMin && currentMinute < entry.endMin
                    }
                    onRemove={() => void removeFromDay(entry.item.id)}
                    onMove={(delta) => void moveInDay(entry.item.id, delta)}
                    onOpen={() => entry.placeId && openDetail(entry.placeId)}
                    rainChance={
                      entry.isOutdoor ? rainChanceAt(forecast, date, entry.startMin) : null
                    }
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
