import { useState } from 'react'
import { motion } from 'motion/react'
import type { EventItem } from '@/lib/api'
import { formatDistance } from '@/lib/format'
import { Scene } from './Scene'
import { CheckIcon, ClockIcon, PinIcon, PlusIcon } from './icons'
import { Badge } from './ui'

/** Stable small integer from the event id, for the fallback artwork. */
function seedFor(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) % 100_000
  return hash
}

function formatDateParts(date: string): { weekday: string; day: string; month: string } | null {
  // date is "YYYY-MM-DD"; parsed as UTC noon to dodge timezone-shift off-by-ones.
  const parsed = new Date(`${date}T12:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return null

  return {
    weekday: parsed.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
    day: parsed.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' }),
    month: parsed.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }),
  }
}

/** "7:30pm" from "19:30". */
function formatTime24(time: string): string {
  const [rawHour, minute] = time.split(':')
  const hour = Number(rawHour)
  if (!Number.isFinite(hour)) return time
  const suffix = hour < 12 ? 'am' : 'pm'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return minute && minute !== '00' ? `${hour12}:${minute}${suffix}` : `${hour12}${suffix}`
}

function formatPriceRange(event: EventItem): string | null {
  const { priceMin, priceMax, currency } = event
  if (priceMin === null && priceMax === null) return null

  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : ''
  const unit = symbol || (currency ? `${currency} ` : '')
  const round = (value: number) => (Number.isInteger(value) ? value : value.toFixed(2))

  if (priceMin !== null && priceMax !== null && priceMin !== priceMax) {
    return `${unit}${round(priceMin)}–${unit}${round(priceMax)}`
  }
  const single = priceMin ?? priceMax
  return single === null ? null : `from ${unit}${round(single)}`
}

export function EventCard({
  event,
  index = 0,
  scheduled = false,
  onAdd,
}: {
  event: EventItem
  index?: number
  scheduled?: boolean
  onAdd?: () => void
}) {
  const date = formatDateParts(event.date)
  const price = formatPriceRange(event)

  /*
   * Provider image URLs do fail — hotlink protection, expiry, plain network
   * trouble — and a broken-image icon looks far worse than the generated
   * artwork we already fall back to when there's no image at all.
   */
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = Boolean(event.imageUrl) && !imageFailed

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.34, delay: Math.min(index * 0.03, 0.24), ease: [0.22, 1, 0.36, 1] }}
      className="group flex flex-col overflow-hidden rounded-shell bg-shell ring-1 ring-ink-200/70 ring-inset shadow-low transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-high"
    >
      <div className="relative aspect-16/10 overflow-hidden bg-sand">
        {showImage ? (
          <img
            src={event.imageUrl ?? ''}
            alt=""
            loading="lazy"
            onError={() => setImageFailed(true)}
            className="absolute inset-0 size-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
        ) : (
          <Scene
            seed={seedFor(event.id)}
            variant="bloom"
            className="absolute inset-0 size-full transition-transform duration-500 ease-out group-hover:scale-105"
          />
        )}

        {/* Date chip — the single most useful thing about an event */}
        {date && (
          <div className="absolute top-3 left-3 grid min-w-14 place-items-center rounded-petal bg-shell/95 px-2.5 py-1.5 text-center shadow-mid backdrop-blur-sm">
            <span className="text-[0.625rem] font-semibold tracking-wide text-bloom-600 uppercase">
              {date.weekday}
            </span>
            <span className="font-display text-xl leading-none font-semibold text-ink-900">
              {date.day}
            </span>
            <span className="text-[0.625rem] font-medium tracking-wide text-ink-500 uppercase">
              {date.month}
            </span>
          </div>
        )}

        {event.segment && (
          <div className="absolute top-3 right-3">
            <Badge tone="glass">{event.segment}</Badge>
          </div>
        )}

        {price && (
          <span className="absolute bottom-3 left-3 rounded-full bg-shell/95 px-3 py-1.5 text-sm font-semibold text-ink-900 shadow-low backdrop-blur-sm">
            {price}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-4 sm:p-5">
        <h3 className="text-[1.0625rem] leading-snug font-semibold text-ink-900">{event.name}</h3>

        {(event.venueName || event.city) && (
          <p className="flex items-center gap-1.5 text-sm text-ink-700">
            <PinIcon className="size-4 shrink-0 text-bloom-400" />
            <span className="truncate">
              {[event.venueName, event.city].filter(Boolean).join(' · ')}
            </span>
          </p>
        )}

        {event.genre && event.genre !== event.segment && (
          <p className="text-xs text-ink-500">{event.genre}</p>
        )}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5 border-t border-ink-100 pt-3.5">
          <div className="flex items-center gap-3 text-xs whitespace-nowrap text-ink-700">
            {event.time && (
              <span className="inline-flex items-center gap-1">
                <ClockIcon className="size-3.5 shrink-0 text-ink-500" />
                {formatTime24(event.time)}
              </span>
            )}
            {event.distanceKm !== null && (
              <span className="inline-flex items-center gap-1">
                <PinIcon className="size-3.5 shrink-0 text-ink-500" />
                {formatDistance(event.distanceKm)}
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {onAdd &&
              (scheduled ? (
                <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-lagoon-100 px-3 text-[0.8125rem] font-medium whitespace-nowrap text-lagoon-600">
                  <CheckIcon className="size-4 shrink-0" />
                  Planned
                </span>
              ) : (
                <button
                  type="button"
                  onClick={onAdd}
                  className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-shell px-3 text-[0.8125rem] font-medium whitespace-nowrap text-ink-900 ring-1 ring-ink-200 ring-inset transition hover:bg-sun-50 hover:ring-sun-300"
                >
                  <PlusIcon className="size-4" />
                  Add
                </button>
              ))}

            {/* Only ticketed listings actually lead to a checkout — a fixture link
                goes to a schedule page, so calling it "Tickets" would mislead. */}
            <a
            href={event.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex h-8 shrink-0 items-center rounded-full bg-sun-400 px-3.5 text-[0.8125rem] font-medium whitespace-nowrap text-ink-900 shadow-low transition-all duration-200 hover:bg-sun-300 hover:shadow-glow-sun"
          >
              {event.source === 'ticketmaster' ? 'Tickets' : 'Details'}
            </a>
          </div>
        </div>
      </div>
    </motion.article>
  )
}
