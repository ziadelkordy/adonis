import { motion } from 'motion/react'
import type { ReactElement, SVGProps } from 'react'
import { cx } from '@/lib/cx'
import type { ViewId } from '@/lib/types'
import { CalendarIcon, CompassIcon, HeartIcon, PalmIcon } from './icons'

/** Only HeartIcon reads `filled`; the wider type lets all four share one list. */
type TabIcon = (props: SVGProps<SVGSVGElement> & { filled?: boolean }) => ReactElement

const TABS: Array<{ id: ViewId; label: string; Icon: TabIcon }> = [
  { id: 'today', label: 'Today', Icon: CalendarIcon },
  { id: 'explore', label: 'Explore', Icon: CompassIcon },
  { id: 'escapes', label: 'Escapes', Icon: PalmIcon },
  { id: 'saved', label: 'Saved', Icon: HeartIcon },
]

interface NavProps {
  view: ViewId
  onChange: (view: ViewId) => void
  savedCount: number
  user: { displayName: string; email: string } | null
  onSignOut: () => void
}

function TabButton({
  tab,
  active,
  savedCount,
  onChange,
  layoutId,
  stacked,
}: {
  tab: (typeof TABS)[number]
  active: boolean
  savedCount: number
  onChange: (view: ViewId) => void
  layoutId: string
  stacked?: boolean
}) {
  const { id, label, Icon } = tab
  const badgeCount = id === 'saved' ? savedCount : 0

  return (
    <button
      type="button"
      onClick={() => onChange(id)}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'relative flex items-center justify-center rounded-full font-medium transition-colors duration-200',
        stacked ? 'h-full flex-1 flex-col gap-1 text-[0.6875rem]' : 'h-10 gap-2 px-4 text-sm',
        active ? 'text-ink-900' : 'text-ink-500 hover:text-ink-800',
      )}
    >
      {active && (
        <motion.span
          layoutId={layoutId}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          className={cx(
            'absolute inset-0 -z-10 bg-shell shadow-low',
            stacked ? 'rounded-petal' : 'rounded-full',
          )}
        />
      )}
      <span className="relative">
        <Icon
          {...(id === 'saved' ? { filled: active } : {})}
          className={stacked ? 'size-5' : 'size-[17px]'}
        />
        {/* Stacked (mobile) has no room for a trailing count, so it rides the icon */}
        {stacked && badgeCount > 0 && (
          <span className="absolute -top-1.5 -right-2 grid min-w-4 place-items-center rounded-full bg-bloom-500 px-1 text-[0.625rem] leading-4 font-semibold text-white">
            {badgeCount}
          </span>
        )}
      </span>
      {label}
      {!stacked && badgeCount > 0 && (
        <span className="grid min-w-[1.125rem] place-items-center rounded-full bg-bloom-500 px-1 text-[0.625rem] leading-[1.125rem] font-semibold text-white">
          {badgeCount}
        </span>
      )}
    </button>
  )
}

export function Nav({ view, onChange, savedCount, user, onSignOut }: NavProps) {
  const today = new Date()
  const dateLabel = today.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <>
      <header className="sticky top-0 z-40">
        <div className="glass border-b border-white/60">
          <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
            {/* Brand */}
            <a
              href="#main"
              onClick={(event) => {
                event.preventDefault()
                onChange('today')
              }}
              className="flex items-center gap-2.5"
            >
              <span className="relative grid size-9 place-items-center rounded-full bg-gradient-to-br from-sun-300 to-bloom-400 shadow-glow-sun">
                <span className="size-4 rounded-full bg-cream" />
              </span>
              <span className="font-display text-xl font-semibold tracking-tight text-ink-900">
                Sundial
              </span>
            </a>

            {/* Desktop tabs */}
            <nav
              aria-label="Sections"
              className="ml-auto hidden items-center gap-1 rounded-full bg-sand/80 p-1 ring-1 ring-ink-200/70 ring-inset md:flex"
            >
              {TABS.map((tab) => (
                <TabButton
                  key={tab.id}
                  tab={tab}
                  active={view === tab.id}
                  savedCount={savedCount}
                  onChange={onChange}
                  layoutId="nav-pill-desktop"
                />
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-3 md:ml-0">
              <p className="hidden text-sm text-ink-700 lg:block">{dateLabel}</p>

              {user ? (
                <div className="flex items-center gap-2">
                  <span
                    className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sun-300 to-bloom-300 text-sm font-semibold text-ink-900"
                    title={user.email}
                    aria-hidden
                  >
                    {user.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <button
                    type="button"
                    onClick={onSignOut}
                    className="rounded-full px-2.5 py-1.5 text-sm font-medium text-ink-700 transition-colors hover:bg-sun-100 hover:text-ink-900"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onChange('today')}
                  className="rounded-full bg-sun-400 px-4 py-2 text-sm font-medium text-ink-900 shadow-low transition-all hover:bg-sun-300 hover:shadow-glow-sun"
                >
                  Sign in
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile bottom bar */}
      <nav
        aria-label="Sections"
        className="glass fixed inset-x-0 bottom-0 z-40 h-[4.5rem] border-t border-white/60 pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <div className="flex h-[4.5rem] items-stretch gap-1 px-3 py-2">
          {TABS.map((tab) => (
            <TabButton
              key={tab.id}
              tab={tab}
              active={view === tab.id}
              savedCount={savedCount}
              onChange={onChange}
              layoutId="nav-pill-mobile"
              stacked
            />
          ))}
        </div>
      </nav>
    </>
  )
}
