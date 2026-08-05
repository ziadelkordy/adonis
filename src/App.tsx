import { motion } from 'motion/react'
import { cx } from '@/lib/cx'
import { useRouter } from '@/lib/router'
import { useAppState } from '@/lib/useAppState'
import { DetailSheet } from '@/components/DetailSheet'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Nav } from '@/components/Nav'
import { CheckIcon, SparkleIcon } from '@/components/icons'
import { Escapes } from '@/views/Escapes'
import { Explore } from '@/views/Explore'
import { Saved } from '@/views/Saved'
import { Today } from '@/views/Today'

export default function App() {
  const router = useRouter()
  const state = useAppState(router)
  const { route, savedIds, toast, user, logout, placeById } = state

  // Detail lives in the URL, so it survives refresh and closes with Back.
  const detailPlace = route.detail ? placeById.get(route.detail) : undefined

  return (
    <div className="relative min-h-dvh overflow-x-clip">
      {/* Ambient background — fixed so it never scrolls with content */}
      <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden>
        <div className="absolute inset-0 bg-cream" />
        <div className="absolute -top-40 -left-32 size-[34rem] rounded-full bg-sun-200/40 blur-[100px]" />
        <div className="absolute top-1/4 -right-40 size-[30rem] rounded-full bg-bloom-200/35 blur-[110px]" />
        <div className="absolute bottom-0 left-1/4 size-[26rem] rounded-full bg-lagoon-100/50 blur-[100px]" />
      </div>

      <Nav
        section={route.section}
        tab={route.tab}
        savedCount={savedIds.size}
        user={user}
        onSignOut={() => void logout()}
        // Changing section closes any open detail panel.
        onNavigate={(section) => router.update({ section, detail: null })}
        location={{
          label: state.locationLabel,
          usingFallback: state.usingFallbackLocation,
          status: state.geo.status,
          // retry clears a remembered refusal, so re-allowing in the browser works.
          onEnable: state.geo.retry,
        }}
      />

      <main id="main" className="mx-auto max-w-7xl px-4 pt-8 pb-28 sm:px-6 lg:px-8 lg:pb-16">
        {/*
         * Keyed remount + enter animation, deliberately without AnimatePresence:
         * `mode="wait"` gates mounting the next view on the previous one's exit
         * animation, and when that exit never resolves the app wedges on the old
         * view while nav state has already moved on. An exit fade here is pure
         * decoration and not worth that failure mode.
         */}
        <motion.div
          key={route.section}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Scoped per section: one broken view shouldn't take the whole app. */}
          <ErrorBoundary key={route.section}>
            {route.section === 'today' && <Today state={state} />}
            {route.section === 'explore' && <Explore state={state} />}
            {route.section === 'escapes' && <Escapes state={state} />}
            {route.section === 'saved' && <Saved state={state} />}
          </ErrorBoundary>
        </motion.div>
      </main>

      {detailPlace && (
        <DetailSheet
          place={detailPlace}
          saved={savedIds.has(detailPlace.id)}
          scheduled={state.scheduledPlaceIds.has(detailPlace.id)}
          onClose={() => router.update({ detail: null })}
          onToggleSaved={() => void state.toggleSaved(detailPlace.id)}
          onAdd={() => void state.addToDay(detailPlace)}
        />
      )}

      <footer className="mx-auto max-w-7xl px-4 pb-28 sm:px-6 lg:px-8 lg:pb-10">
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-200/70 pt-6 text-xs text-ink-500">
          <p className="inline-flex flex-wrap items-center gap-1.5">
            <SparkleIcon className="size-3.5 text-sun-500" />
            Places and map data from{' '}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer noopener"
              className="underline decoration-ink-300 underline-offset-2 hover:text-ink-700"
            >
              OpenStreetMap contributors
            </a>{' '}
            (ODbL). Fixtures from ESPN.
          </p>
          <p>Your plans live in Sundial's own database</p>
        </div>
      </footer>

      {/* Toast */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4 lg:bottom-8"
        role="status"
        aria-live="polite"
      >
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className={cx(
              'pointer-events-auto flex max-w-md items-center gap-2.5 rounded-full py-3 pr-5 pl-4 shadow-high',
              toast.tone === 'warning' ? 'bg-bloom-600 text-white' : 'bg-ink-900 text-sun-100',
            )}
          >
            <span
              className={cx(
                'grid size-6 shrink-0 place-items-center rounded-full',
                toast.tone === 'warning' ? 'bg-white/20' : 'bg-sun-400 text-ink-900',
              )}
            >
              {toast.tone === 'warning' ? (
                <span aria-hidden className="text-sm leading-none">
                  !
                </span>
              ) : (
                <CheckIcon className="size-4" />
              )}
            </span>
            <p className="text-sm font-medium">{toast.message}</p>
          </motion.div>
        )}
      </div>
    </div>
  )
}
