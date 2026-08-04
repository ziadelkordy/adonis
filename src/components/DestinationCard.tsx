import { motion } from 'motion/react'
import { formatPrice } from '@/lib/format'
import type { Destination } from '@/lib/types'
import { Scene } from './Scene'
import { PlaneIcon, SparkleIcon, SunIcon, ThermometerIcon } from './icons'
import { Badge, Rating, SaveButton } from './ui'

interface DestinationCardProps {
  destination: Destination
  saved: boolean
  onToggleSaved: () => void
  /** Featured cards run wider and taller at the top of the grid. */
  featured?: boolean
  index?: number
}

export function DestinationCard({
  destination,
  saved,
  onToggleSaved,
  featured = false,
  index = 0,
}: DestinationCardProps) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.34, delay: Math.min(index * 0.04, 0.28), ease: [0.22, 1, 0.36, 1] }}
      className={[
        'group relative flex flex-col justify-end overflow-hidden rounded-shell shadow-mid',
        'ring-1 ring-ink-200/70 ring-inset transition-all duration-300 ease-out hover:shadow-high',
        featured ? 'min-h-[26rem] sm:col-span-2 sm:min-h-[22rem]' : 'min-h-[21rem]',
      ].join(' ')}
    >
      <Scene
        seed={destination.seed}
        variant={index % 3 === 1 ? 'lagoon' : index % 3 === 2 ? 'bloom' : 'sun'}
        className="absolute inset-0 size-full transition-transform duration-700 ease-out group-hover:scale-[1.07]"
      />

      {/* Legibility scrim — the artwork is bright, so text needs a dark floor */}
      <div className="scrim-editorial absolute inset-0" aria-hidden />

      <div className="absolute inset-x-4 top-4 flex items-start justify-between gap-2">
        {featured ? (
          <Badge tone="glass">
            <SparkleIcon className="size-3.5 text-bloom-500" />
            Trip of the month
          </Badge>
        ) : (
          <Badge tone="glass">{destination.country}</Badge>
        )}
        <SaveButton saved={saved} onToggle={onToggleSaved} label={destination.name} />
      </div>

      <div className="text-on-art relative p-5 text-white sm:p-6">
        <p className="text-xs font-semibold tracking-[0.16em] text-sun-100 uppercase">
          {destination.region}
        </p>
        <h3
          className={[
            'mt-1 font-semibold text-white',
            featured ? 'text-3xl sm:text-4xl' : 'text-2xl',
          ].join(' ')}
        >
          {destination.name}
        </h3>

        <p
          className={[
            'mt-2 leading-relaxed text-white/85',
            featured ? 'max-w-xl text-[0.9375rem]' : 'text-sm',
          ].join(' ')}
        >
          {destination.blurb}
        </p>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {destination.vibes.map((vibe) => (
            <span
              key={vibe}
              className="rounded-full bg-white/18 px-2.5 py-1 text-xs font-medium text-white ring-1 ring-white/25 ring-inset backdrop-blur-sm"
            >
              {vibe}
            </span>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/20 pt-4 text-xs text-white/85">
          <span className="text-sm text-white">
            <span className="font-semibold">{formatPrice(destination.nightlyFrom)}</span>
            <span className="text-white/70"> / night</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <PlaneIcon className="size-3.5" />
            {destination.flightHours}h flight
          </span>
          <span className="inline-flex items-center gap-1.5">
            <SunIcon className="size-3.5" />
            {destination.bestMonths}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ThermometerIcon className="size-3.5" />
            {destination.avgTempC}°C
          </span>
          <Rating
            value={destination.rating}
            count={destination.reviewCount}
            className="ml-auto text-white/85 [&_span]:text-white"
          />
        </div>
      </div>
    </motion.article>
  )
}
