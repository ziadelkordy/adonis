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
  } = state

  const savedDestinations = useMemo(
    () => DESTINATIONS.filter((destination) => savedIds.has(destination.id)),
    [savedIds],
  )

  // savedPlaces comes from the server and already contains only saved places.
  const total = savedPlaces.length + savedDestinations.length

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
            : `${total} ${pluralize(total, 'thing')} put aside for later — ${savedPlaces.length} nearby, ${savedDestinations.length} far away.`
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
              />
            ))}
          </div>
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
