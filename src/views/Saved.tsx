import { useMemo } from 'react'
import { DESTINATIONS } from '@/lib/data'
import { pluralize } from '@/lib/format'
import type { AppState } from '@/lib/useAppState'
import { AuthPanel } from '@/components/AuthPanel'
import { DestinationCard } from '@/components/DestinationCard'
import { PlaceCard } from '@/components/PlaceCard'
import { Button, EmptyState, SectionHeader } from '@/components/ui'

export function Saved({ state }: { state: AppState }) {
  const {
    user,
    authStatus,
    savedIds,
    savedPlaces,
    scheduledPlaceIds,
    toggleSaved,
    addToDay,
    setView,
    openDetail,
    savedEvents,
  } = state

  const savedDestinations = useMemo(
    () => DESTINATIONS.filter((destination) => savedIds.has(destination.id)),
    [savedIds],
  )

  // savedPlaces comes from the server and already contains only saved places.
  const total = savedPlaces.length + savedDestinations.length + savedEvents.length

  if (authStatus === 'loading') {
    return <div className="h-96 animate-pulse rounded-dune bg-sand/60" />
  }

  if (!user) {
    return (
      <AuthPanel
        state={state}
        heading="Sign in to see your saved places"
        description="Hearts are stored against your account, so they're waiting for you on any browser you sign in from."
      />
    )
  }

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Saved"
        title="Everything you've hearted"
        description={
          total === 0
            ? 'Nothing saved yet.'
            : `${total} ${pluralize(total, 'thing')} put aside for later — ${savedPlaces.length} nearby, ${savedEvents.length} ${pluralize(savedEvents.length, 'event')}, ${savedDestinations.length} far away.`
        }
      />

      {total === 0 && (
        <EmptyState
          emoji="💛"
          title="No favourites yet"
          description="Tap the heart on anything in Explore or Escapes and it lands here, ready for when you actually have a free Saturday."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => setView('explore')}>Browse what's nearby</Button>
              <Button variant="secondary" onClick={() => setView('escapes')}>
                Browse escapes
              </Button>
            </div>
          }
        />
      )}

      {savedPlaces.length > 0 && (
        <section className="space-y-4">
          <h3 className="text-lg font-semibold text-ink-900">
            Places{' '}
            <span className="font-sans text-sm font-normal text-ink-500">
              ({savedPlaces.length})
            </span>
          </h3>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {savedPlaces.map((place, index) => (
              <PlaceCard
                key={place.id}
                place={place}
                index={index}
                saved
                scheduled={scheduledPlaceIds.has(place.id)}
                onToggleSaved={() => void toggleSaved(place.id)}
                onAdd={() => void addToDay(place)}
                onOpen={() => openDetail(place.id)}
              />
            ))}
          </div>
        </section>
      )}

      {savedEvents.length > 0 && (
        <section className="space-y-4">
          <h3 className="text-lg font-semibold text-ink-900">
            Events{' '}
            <span className="font-sans text-sm font-normal text-ink-500">
              ({savedEvents.length})
            </span>
          </h3>
          <ul className="grid gap-3 sm:grid-cols-2">
            {savedEvents.map((event) => (
              <li
                key={event.id}
                className="flex items-center gap-3 rounded-petal bg-shell p-4 ring-1 ring-ink-200/70 ring-inset shadow-low"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink-900">{event.name}</p>
                  <p className="mt-0.5 truncate text-xs text-ink-700">
                    {[event.date, event.venueName].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void toggleSaved(event.id)}
                  className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium text-bloom-600 transition hover:bg-bloom-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {savedDestinations.length > 0 && (
        <section className="space-y-4">
          <h3 className="text-lg font-semibold text-ink-900">
            Escapes{' '}
            <span className="font-sans text-sm font-normal text-ink-500">
              ({savedDestinations.length})
            </span>
          </h3>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {savedDestinations.map((destination, index) => (
              <DestinationCard
                key={destination.id}
                destination={destination}
                index={index}
                saved
                onToggleSaved={() => void toggleSaved(destination.id)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
