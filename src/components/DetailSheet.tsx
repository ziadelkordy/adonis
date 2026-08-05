import { useEffect } from 'react'
import { motion } from 'motion/react'
import type { Place } from '@/lib/api'
import { CATEGORY_META } from '@/lib/data'
import { formatDistance, formatDuration } from '@/lib/format'
import { MapView } from './MapView'
import { PhotoCredit, PlaceImage } from './PlaceImage'
import { CheckIcon, ClockIcon, PinIcon, PlusIcon, XIcon } from './icons'
import { Badge, Button, SaveButton } from './ui'


/** Opens the location in the viewer's own maps app rather than assuming one. */
function directionsHref(place: Place): string {
  return `https://www.openstreetmap.org/directions?to=${place.lat}%2C${place.lon}`
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-ink-100 py-2.5 last:border-0">
      <dt className="w-24 shrink-0 text-xs font-medium tracking-wide text-ink-500 uppercase">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 text-sm break-words text-ink-900">{children}</dd>
    </div>
  )
}

interface DetailSheetProps {
  place: Place
  saved: boolean
  scheduled: boolean
  onClose: () => void
  onToggleSaved: () => void
  onAdd: () => void
}

export function DetailSheet({
  place,
  saved,
  scheduled,
  onClose,
  onToggleSaved,
  onAdd,
}: DetailSheetProps) {
  const category = CATEGORY_META[place.category]

  // Escape closes it, and the body must not scroll behind the panel.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)

    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <motion.button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 cursor-default bg-ink-900/35 backdrop-blur-[2px]"
      />

      <motion.aside
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        transition={{ type: 'spring', stiffness: 340, damping: 34 }}
        className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto bg-cream shadow-high"
      >
        {/* Artwork header */}
        <div className="relative aspect-16/9 shrink-0 overflow-hidden">
          <PlaceImage
            id={place.id}
            name={place.name}
            hue={category.hue}
            photo={place.photo ?? null}
            priority
            className="absolute inset-0 size-full"
          />
          {place.photo && (
            <div className="absolute inset-x-4 bottom-3 flex">
              <PhotoCredit
                photo={place.photo}
                className="drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]"
              />
            </div>
          )}
          <div className="absolute inset-x-4 top-4 flex items-start justify-between gap-2">
            <Badge tone="glass">
              <span aria-hidden>{category.emoji}</span>
              {category.label}
            </Badge>
            <div className="flex items-center gap-2">
              <SaveButton saved={saved} onToggle={onToggleSaved} label={place.name} />
              <button
                type="button"
                onClick={onClose}
                aria-label="Close details"
                className="glass grid size-9 place-items-center rounded-full text-ink-900 ring-1 ring-white/70 ring-inset transition hover:scale-110"
              >
                <XIcon className="size-[18px]" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-5 p-5 sm:p-6">
          <div>
            <h2 className="font-display text-2xl font-semibold text-ink-900">{place.name}</h2>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-700">
              {place.neighborhood && (
                <span className="inline-flex items-center gap-1.5">
                  <PinIcon className="size-4 text-bloom-400" />
                  {place.neighborhood}
                </span>
              )}
              {place.distanceKm !== undefined && (
                <>
                  <span className="text-ink-300">·</span>
                  <span>{formatDistance(place.distanceKm)} away</span>
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {scheduled ? (
              <span className="inline-flex h-10 items-center gap-1.5 rounded-full bg-lagoon-100 px-4 text-sm font-medium text-lagoon-600">
                <CheckIcon className="size-4" />
                On your day
              </span>
            ) : (
              <Button onClick={onAdd}>
                <PlusIcon className="size-4" />
                Add to my day
              </Button>
            )}
            <Button variant="secondary" onClick={onToggleSaved}>
              {saved ? 'Saved' : 'Save for later'}
            </Button>
          </div>

          {/* Facts — only rows OpenStreetMap actually has data for */}
          <dl className="rounded-petal bg-shell p-4 ring-1 ring-ink-200/70 ring-inset">
            <Row label="Visit">
              <span className="inline-flex items-center gap-1.5">
                <ClockIcon className="size-4 text-ink-500" />~{formatDuration(place.durationMin)}
              </span>
              <span className="mt-0.5 block text-xs text-ink-500">
                Estimated from the kind of place — OpenStreetMap records hours, not how long you stay.
              </span>
            </Row>

            {place.openingHours && (
              <Row label="Hours">
                <span className="font-mono text-[0.8125rem]">{place.openingHours}</span>
                <span className="mt-0.5 block text-xs text-ink-500">
                  Shown exactly as recorded, deliberately not interpreted.
                </span>
              </Row>
            )}

            {place.cuisine && <Row label="Cuisine">{place.cuisine.replace(/;/g, ', ')}</Row>}

            {place.fee !== null && (
              <Row label="Entry">{place.fee ? 'Has a fee' : 'Free to enter'}</Row>
            )}

            {place.phone && (
              <Row label="Phone">
                <a href={`tel:${place.phone}`} className="text-bloom-600 hover:underline">
                  {place.phone}
                </a>
              </Row>
            )}

            {place.website && (
              <Row label="Website">
                <a
                  href={place.website}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="break-all text-bloom-600 hover:underline"
                >
                  {place.website.replace(/^https?:\/\//, '')}
                </a>
              </Row>
            )}

            <Row label="Coords">
              <span className="font-mono text-[0.8125rem] text-ink-700">
                {place.lat.toFixed(5)}, {place.lon.toFixed(5)}
              </span>
            </Row>
          </dl>

          {/* Where it is */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink-900">Where it is</h3>
            <MapView
              center={{ lat: place.lat, lon: place.lon }}
              markers={[
                {
                  id: place.id,
                  lat: place.lat,
                  lon: place.lon,
                  label: place.name,
                  kind: 'place',
                },
              ]}
              selectedId={place.id}
              onSelect={() => {}}
              className="h-56 w-full overflow-hidden rounded-petal ring-1 ring-ink-200 ring-inset"
            />
            <a
              href={directionsHref(place)}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-2.5 inline-flex text-sm font-medium text-bloom-600 hover:underline"
            >
              Get directions →
            </a>
          </div>
        </div>
      </motion.aside>
    </div>
  )
}
