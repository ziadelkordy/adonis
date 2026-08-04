import { useMemo } from 'react'
import { ACTIVITIES, DESTINATIONS } from '@/lib/data'
import { pluralize } from '@/lib/format'
import type { AppState } from '@/lib/useAppState'
import { ActivityCard } from '@/components/ActivityCard'
import { DestinationCard } from '@/components/DestinationCard'
import { Button, EmptyState, SectionHeader } from '@/components/ui'

export function Saved({ state }: { state: AppState }) {
  const { saved, scheduledActivityIds, toggleSaved, addToDay, setView } = state

  const savedActivities = useMemo(
    () => ACTIVITIES.filter((activity) => saved.has(activity.id)),
    [saved],
  )
  const savedDestinations = useMemo(
    () => DESTINATIONS.filter((destination) => saved.has(destination.id)),
    [saved],
  )

  const total = savedActivities.length + savedDestinations.length

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Saved"
        title="Everything you've hearted"
        description={
          total === 0
            ? 'Nothing saved yet.'
            : `${total} ${pluralize(total, 'thing')} put aside for later — ${savedActivities.length} nearby, ${savedDestinations.length} far away.`
        }
      />

      {total === 0 && (
        <EmptyState
          emoji="💛"
          title="No favourites yet"
          description="Tap the heart on anything in Explore or Escapes and it lands here, so you can come back to it when you actually have a free Saturday."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => setView('explore')}>Browse things to do</Button>
              <Button variant="secondary" onClick={() => setView('escapes')}>
                Browse escapes
              </Button>
            </div>
          }
        />
      )}

      {savedActivities.length > 0 && (
        <section className="space-y-4">
          <h3 className="text-lg font-semibold text-ink-900">
            Things to do{' '}
            <span className="font-sans text-sm font-normal text-ink-500">
              ({savedActivities.length})
            </span>
          </h3>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {savedActivities.map((activity, index) => (
              <ActivityCard
                key={activity.id}
                activity={activity}
                index={index}
                saved
                scheduled={scheduledActivityIds.has(activity.id)}
                onToggleSaved={() => toggleSaved(activity.id)}
                onAdd={() => addToDay(activity)}
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
                onToggleSaved={() => toggleSaved(destination.id)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
