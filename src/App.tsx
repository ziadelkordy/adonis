import { motion } from 'motion/react'
import { cx } from '@/lib/cx'
import { Nav } from '@/components/Nav'
import { CheckIcon, SparkleIcon } from '@/components/icons'
import { useAppState } from '@/lib/useAppState'
import { Escapes } from '@/views/Escapes'
import { Explore } from '@/views/Explore'
import { Saved } from '@/views/Saved'
import { Today } from '@/views/Today'

export default function App() {
  const state = useAppState()
  const { view, setView, savedIds, toast, user, logout } = state

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
        view={view}
        onChange={setView}
        savedCount={savedIds.size}
        user={user}
        onSignOut={() => void logout()}
      />

      <main
        id="main"
        className="mx-auto max-w-7xl px-4 pt-8 pb-28 sm:px-6 lg:px-8 lg:pb-16"
      >
        {/*
         * Keyed remount + enter animation, deliberately without AnimatePresence:
         * `mode="wait"` gates mounting the next view on the previous one's exit
         * animation, and when that exit never resolves the app wedges on the old
         * view while nav state has already moved on. An exit fade here is pure
         * decoration and not worth that failure mode (or the 260ms it adds).
         */}
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          {view === 'today' && <Today state={state} />}
          {view === 'explore' && <Explore state={state} />}
          {view === 'escapes' && <Escapes state={state} />}
          {view === 'saved' && <Saved state={state} />}
        </motion.div>
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-28 sm:px-6 lg:px-8 lg:pb-10">
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-200/70 pt-6 text-xs text-ink-500">
          <p className="inline-flex items-center gap-1.5">
            <SparkleIcon className="size-3.5 text-sun-500" />
            Nearby places are real data from{' '}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer noopener"
              className="underline decoration-ink-300 underline-offset-2 hover:text-ink-700"
            >
              OpenStreetMap contributors
            </a>{' '}
            (ODbL). Vacation spots are hand-picked.
          </p>
          <p>Your day and saved places live in Sundial's own database</p>
        </div>
      </footer>

      {/* Toast */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 lg:bottom-8"
        role="status"
        aria-live="polite"
      >
        {/* No AnimatePresence — see the note on the view container above. Two
            toasts were piling up because the outgoing one never exited. */}
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
