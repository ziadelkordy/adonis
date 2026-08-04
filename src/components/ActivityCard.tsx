import { motion } from 'motion/react'
import { CATEGORY_META } from '@/lib/data'
import { formatDistance, formatDuration, formatPrice } from '@/lib/format'
import { sceneVariantFor } from '@/lib/scene'
import type { Activity } from '@/lib/types'
import { Scene } from './Scene'
import { CheckIcon, ClockIcon, PinIcon, PlusIcon } from './icons'
import { Badge, Button, Rating, SaveButton } from './ui'

interface ActivityCardProps {
  activity: Activity
  saved: boolean
  scheduled: boolean
  onToggleSaved: () => void
  onAdd: () => void
  index?: number
}

export function ActivityCard({
  activity,
  saved,
  scheduled,
  onToggleSaved,
  onAdd,
  index = 0,
}: ActivityCardProps) {
  const category = CATEGORY_META[activity.category]

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.34, delay: Math.min(index * 0.035, 0.28), ease: [0.22, 1, 0.36, 1] }}
      className="group flex flex-col overflow-hidden rounded-shell bg-shell ring-1 ring-ink-200/70 ring-inset shadow-low transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-high"
    >
      {/* Artwork */}
      <div className="relative aspect-16/10 overflow-hidden">
        <Scene
          seed={activity.seed}
          variant={sceneVariantFor(category.hue)}
          className="absolute inset-0 size-full transition-transform duration-500 ease-out group-hover:scale-105"
        />

        <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <Badge tone="glass">
            <span aria-hidden>{category.emoji}</span>
            {category.label}
          </Badge>
          <SaveButton saved={saved} onToggle={onToggleSaved} label={activity.title} />
        </div>

        <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2">
          <span className="glass rounded-full px-3 py-1.5 text-sm font-semibold text-ink-900 ring-1 ring-white/70 ring-inset">
            {formatPrice(activity.price)}
            {activity.price > 0 && (
              <span className="ml-1 text-xs font-normal text-ink-700">/ person</span>
            )}
          </span>
          {activity.outdoor && (
            <Badge tone="glass" className="text-[0.6875rem]">
              Outdoors
            </Badge>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[1.0625rem] leading-snug font-semibold text-ink-900">
            {activity.title}
          </h3>
          <Rating value={activity.rating} count={activity.reviewCount} className="mt-0.5 shrink-0" />
        </div>

        <p className="flex items-center gap-1.5 text-sm text-ink-700">
          <PinIcon className="size-4 shrink-0 text-bloom-400" />
          <span className="truncate">
            {activity.place} · {activity.neighborhood}
          </span>
        </p>

        <p className="text-sm leading-relaxed text-ink-700">{activity.blurb}</p>

        <div className="mt-auto flex flex-wrap gap-1.5">
          {activity.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} tone="sun">
              {tag}
            </Badge>
          ))}
        </div>

        {/* Wraps as a whole at narrow card widths rather than breaking mid-label */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5 border-t border-ink-100 pt-3.5">
          <div className="flex items-center gap-3 text-xs whitespace-nowrap text-ink-700">
            <span className="inline-flex items-center gap-1">
              <ClockIcon className="size-3.5 shrink-0 text-ink-500" />
              {formatDuration(activity.durationMin)}
            </span>
            <span className="inline-flex items-center gap-1">
              <PinIcon className="size-3.5 shrink-0 text-ink-500" />
              {formatDistance(activity.distanceKm)}
            </span>
          </div>

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
