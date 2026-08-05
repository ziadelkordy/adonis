import { motion } from 'motion/react'
import type { MouseEvent, ReactElement, SVGProps } from 'react'
import { cx } from '@/lib/cx'
import { type ExploreTab, type SectionName, routeToHref } from '@/lib/router'
import { CalendarIcon, CompassIcon, HeartIcon, PalmIcon, PinIcon, SunIcon } from './icons'

/** Only HeartIcon reads `filled`; the wider type lets all four share one list. */
type TabIcon = (props: SVGProps<SVGSVGElement> & { filled?: boolean }) => ReactElement

const TABS: Array<{ section: SectionName; label: string; Icon: TabIcon }> = [
  { section: 'today', label: 'Today', Icon: CalendarIcon },
  { section: 'explore', label: 'Explore', Icon: CompassIcon },
  { section: 'escapes', label: 'Escapes', Icon: PalmIcon },
  { section: 'saved', label: 'Saved', Icon: HeartIcon },
]

/*
 * Real anchors, not buttons.
 *
 * That gives middle-click, cmd-click, "copy link address" and hover previews for
 * free — all of which a button silently breaks. The click handler intercepts the
 * plain-left-click case for client-side navigation and leaves modified clicks to
 * the browser.
 */
function isPlainClick(event: MouseEvent): boolean {
  return !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0
}

function TabLink({
  tab,
  active,
  savedCount,
  tabForExplore,
  layoutId,
  stacked,
  onNavigate,
}: {
  tab: (typeof TABS)[number]
  active: boolean
  savedCount: number
  tabForExplore: ExploreTab
  layoutId: string
  stacked?: boolean
  onNavigate: (section: SectionName) => void
}) {
  const { section, label, Icon } = tab
  const badgeCount = section === 'saved' ? savedCount : 0

  // Explore keeps whichever sub-tab you were last on.
  const href = routeToHref({ section, tab: section === 'explore' ? tabForExplore : undefined })

  return (
    <a
      href={href}
      aria-current={active ? 'page' : undefined}
      onClick={(event) => {
        if (!isPlainClick(event)) return
        event.preventDefault()
        onNavigate(section)
      }}
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
          {...(section === 'saved' ? { filled: active } : {})}
          className={stacked ? 'size-5' : 'size-[17px]'}
        />
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
    </a>
  )
}

interface NavProps {
  section: SectionName
  tab: ExploreTab
  savedCount: number
  user: { displayName: string; email: string } | null
  onSignOut: () => void
  /** Owned by the router in App, so there's one source of navigation truth. */
  onNavigate: (section: SectionName) => void
  /*
   * Location belongs in the header, not buried in one tab. It used to live only
   * inside Explore's location bar, which meant anyone landing on Today — the
   * default page — had no way to grant permission at all.
   */
  location: {
    label: string | null
    usingFallback: boolean
    status: string
    onEnable: () => void
  }
}

/** Compact header control: where we think you are, and how to fix it if wrong. */
function LocationChip({ location }: { location: NavProps['location'] }) {
  const { label, usingFallback, status, onEnable } = location

  if (status === 'prompting') {
    return (
      <span className="hidden items-center gap-1.5 rounded-full bg-sand/80 px-3 py-1.5 text-xs font-medium text-ink-700 sm:inline-flex">
        <PinIcon className="size-3.5 animate-pulse text-bloom-400" />
        Locating…
      </span>
    )
  }

  if (usingFallback) {
    return (
      <button
        type="button"
        onClick={onEnable}
        title={
          status === 'denied'
            ? 'Location is blocked for this site. Allow it in your browser, then click here.'
            : 'Use your real location'
        }
        className="inline-flex items-center gap-1.5 rounded-full bg-bloom-500 px-3 py-1.5 text-xs font-semibold text-white shadow-low transition hover:bg-bloom-400"
      >
        <SunIcon className="size-3.5" />
        <span className="hidden sm:inline">Use my location</span>
        <span className="sm:hidden">Locate</span>
      </button>
    )
  }

  return (
    <span
      className="hidden items-center gap-1.5 rounded-full bg-lagoon-50 px-3 py-1.5 text-xs font-medium text-lagoon-600 sm:inline-flex"
      title="Using your device location"
    >
      <PinIcon className="size-3.5" />
      {label ?? 'Located'}
    </span>
  )
}

export function Nav({
  section,
  tab,
  savedCount,
  user,
  onSignOut,
  onNavigate,
  location,
}: NavProps) {
  const navigate = onNavigate

  return (
    <>
      <header className="sticky top-0 z-40">
        <div className="glass border-b border-white/60">
          <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
            <a
              href="/"
              onClick={(event) => {
                if (!isPlainClick(event)) return
                event.preventDefault()
                navigate('today')
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

            <nav
              aria-label="Sections"
              className="ml-auto hidden items-center gap-1 rounded-full bg-sand/80 p-1 ring-1 ring-ink-200/70 ring-inset md:flex"
            >
              {TABS.map((entry) => (
                <TabLink
                  key={entry.section}
                  tab={entry}
                  active={section === entry.section}
                  savedCount={savedCount}
                  tabForExplore={tab}
                  layoutId="nav-pill-desktop"
                  onNavigate={navigate}
                />
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-2 md:ml-0 md:gap-3">
              <LocationChip location={location} />

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
                <a
                  href="/"
                  onClick={(event) => {
                    if (!isPlainClick(event)) return
                    event.preventDefault()
                    navigate('today')
                  }}
                  className="rounded-full bg-sun-400 px-4 py-2 text-sm font-medium text-ink-900 shadow-low transition-all hover:bg-sun-300 hover:shadow-glow-sun"
                >
                  Sign in
                </a>
              )}
            </div>
          </div>
        </div>
      </header>

      <nav
        aria-label="Sections"
        className="glass fixed inset-x-0 bottom-0 z-40 h-[4.5rem] border-t border-white/60 pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <div className="flex h-[4.5rem] items-stretch gap-1 px-3 py-2">
          {TABS.map((entry) => (
            <TabLink
              key={entry.section}
              tab={entry}
              active={section === entry.section}
              savedCount={savedCount}
              tabForExplore={tab}
              layoutId="nav-pill-mobile"
              stacked
              onNavigate={navigate}
            />
          ))}
        </div>
      </nav>
    </>
  )
}
