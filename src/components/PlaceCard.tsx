import { motion } from 'motion/react'
import type { Place } from '@/lib/api'
import { CATEGORY_META } from '@/lib/data'
import { formatDistance, formatDuration } from '@/lib/format'
import { sceneVariantFor } from '@/lib/scene'
import { Scene } from './Scene'
import { CheckIcon, ClockIcon, PinIcon, PlusIcon } from './icons'
import { Badge, Button, SaveButton } from './ui'

/** Turns "way/12345" into a stable small integer for the generated artwork. */
function seedFor(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) % 100_000
  }
  return hash
}

interface PlaceCardProps {
  place: Place
  saved: boolean
  scheduled: boolean
  onToggleSaved: () => void
  onAdd: () => void
  index?: number
}

export function PlaceCard({
  place,
  saved,
  scheduled,
  onToggleSaved,
  onAdd,
  index = 0,
}: PlaceCardProps) {
  const category = CATEGORY_META[place.category]

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.34, delay: Math.min(index * 0.03, 0.24), ease: [0.22, 1, 0.36, 1] }}
      className="group flex flex-col overflow-hidden rounded-shell bg-shell ring-1 ring-ink-200/70 ring-inset shadow-low transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-high"
    >
      <div className="relative aspect-16/10 overflow-hidden">
        <Scene
          seed={seedFor(place.id)}
          variant={sceneVariantFor(category.hue)}
          className="absolute inset-0 size-full transition-transform duration-500 ease-out group-hover:scale-105"
        />

        <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <Badge tone="glass">
            <span aria-hidden>{category.emoji}</span>
            {category.label}
          </Badge>
          <SaveButton saved={saved} onToggle={onToggleSaved} label={place.name} />
        </div>

        <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2">
          <span className="glass rounded-full px-3 py-1.5 text-sm font-semibold text-ink-900 ring-1 ring-white/70 ring-inset">
            {place.distanceKm !== undefined ? formatDistance(place.distanceKm) : 'nearby'}
          </span>
          {/* OSM only rarely records a fee, so this shows only when it actually does. */}
          {place.fee === false && (
            <Badge tone="glass" className="text-[0.6875rem]">
              Free
            </Badge>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-4 sm:p-5">
        <h3 className="text-[1.0625rem] leading-snug font-semibold text-ink-900">{place.name}</h3>

        {(place.neighborhood || place.cuisine) && (
          <p className="flex items-center gap-1.5 text-sm text-ink-700">
            <PinIcon className="size-4 shrink-0 text-bloom-400" />
            <span className="truncate">
              {[place.neighborhood, place.cuisine?.replace(/;/g, ', ')].filter(Boolean).join(' · ')}
            </span>
          </p>
        )}

        {place.openingHours && (
          <p className="truncate text-xs text-ink-500" title={place.openingHours}>
            Hours: {place.openingHours}
          </p>
        )}

        {place.website && (
          <a
            href={place.website}
            target="_blank"
            rel="noreferrer noopener"
            className="w-fit truncate text-xs font-medium text-bloom-600 underline decoration-bloom-200 underline-offset-2 hover:decoration-bloom-500"
          >
            Visit website
          </a>
        )}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5 border-t border-ink-100 pt-3.5">
          <span
            className="inline-flex items-center gap-1 text-xs whitespace-nowrap text-ink-700"
            title="An estimate based on the kind of place — OpenStreetMap doesn't record visit lengths."
          >
            <ClockIcon className="size-3.5 shrink-0 text-ink-500" />
            ~{formatDuration(place.durationMin)}
          </span>

          {scheduled ? (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-lagoon-100 px-3 text-[0.8125rem] font-medium whitespace-nowrap text-lagoon-600">
              <CheckIcon className="size-4 shrink-0" />
              In your day
            </span>
          ) : (
            <Button size="sm" onClick={onAdd}>
              <PlusIcon className="size-4" />
              Add to day
            </Button>
          )}
        </div>
      </div>
    </motion.article>
  )
}
