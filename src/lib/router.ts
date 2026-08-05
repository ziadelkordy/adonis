import { useCallback, useEffect, useState } from 'react'

/*
 * A small History-API router.
 *
 * The app previously kept the current section in component state, which meant a
 * refresh dumped you back on Today, the back button did nothing, and no view
 * could be linked or shared. Everything that decides what's on screen now lives
 * in the URL instead.
 *
 * Hand-rolled rather than pulled from a library: there are four sections and two
 * query params, and the whole thing is smaller than the config a router would
 * need.
 */

export type ExploreTab = 'nearby' | 'fun' | 'events'
export type SectionName = 'today' | 'explore' | 'escapes' | 'saved'

export interface Route {
  section: SectionName
  /** Explore only. */
  tab: ExploreTab
  /** Today only: the day being planned, as YYYY-MM-DD. */
  date: string | null
  /** Free-text search, shared by Explore and Escapes. */
  query: string
  /**
   * Detail overlay, layered over whichever section is showing. Kept in the URL so
   * a specific place is linkable, and so closing it is just a back navigation.
   */
  detail: string | null
  /** Explore only: map instead of a grid. */
  view: 'grid' | 'map'
}

const TABS: ExploreTab[] = ['nearby', 'fun', 'events']

export function todayISO(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(parsed.getTime())
}

export function parseRoute(pathname: string, search: string): Route {
  const params = new URLSearchParams(search)
  const segments = pathname.split('/').filter(Boolean)

  const first = segments[0]
  const section: SectionName =
    first === 'explore' || first === 'escapes' || first === 'saved' ? first : 'today'

  const rawTab = segments[1]
  const tab: ExploreTab =
    section === 'explore' && TABS.includes(rawTab as ExploreTab) ? (rawTab as ExploreTab) : 'nearby'

  const rawDate = params.get('date')

  return {
    section,
    tab,
    date: rawDate && isValidDate(rawDate) ? rawDate : null,
    query: params.get('q') ?? '',
    detail: params.get('place'),
    view: params.get('view') === 'map' ? 'map' : 'grid',
  }
}

export function routeToHref(route: Partial<Route> & { section: SectionName }): string {
  const path =
    route.section === 'explore'
      ? `/explore/${route.tab ?? 'nearby'}`
      : route.section === 'today'
        ? '/'
        : `/${route.section}`

  const params = new URLSearchParams()
  // Today's own date is the default, so it stays out of the URL.
  if (route.date && route.date !== todayISO()) params.set('date', route.date)
  if (route.query) params.set('q', route.query)
  if (route.detail) params.set('place', route.detail)
  if (route.view === 'map') params.set('view', 'map')

  const search = params.toString()
  return search ? `${path}?${search}` : path
}

function currentRoute(): Route {
  if (typeof window === 'undefined') return parseRoute('/', '')
  return parseRoute(window.location.pathname, window.location.search)
}

export function useRouter() {
  const [route, setRoute] = useState<Route>(currentRoute)

  useEffect(() => {
    const sync = () => setRoute(currentRoute())
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  /** Adds a history entry — use for navigation the back button should undo. */
  const navigate = useCallback((next: Partial<Route> & { section: SectionName }) => {
    const href = routeToHref(next)
    if (href !== `${window.location.pathname}${window.location.search}`) {
      window.history.pushState(null, '', href)
    }
    setRoute(currentRoute())
  }, [])

  /**
   * Rewrites the current entry. For incidental state — typing in a search box —
   * where one history entry per keystroke would make Back unusable.
   */
  const replace = useCallback((next: Partial<Route> & { section: SectionName }) => {
    window.history.replaceState(null, '', routeToHref(next))
    setRoute(currentRoute())
  }, [])

  /** Merges a patch into the current route, keeping everything else. */
  const update = useCallback(
    (patch: Partial<Route>, mode: 'push' | 'replace' = 'push') => {
      const merged = { ...currentRoute(), ...patch }
      if (mode === 'push') navigate(merged)
      else replace(merged)
    },
    [navigate, replace],
  )

  return { route, navigate, replace, update }
}

export type Router = ReturnType<typeof useRouter>

/** Date shifted by whole days, as YYYY-MM-DD. */
export function shiftDate(date: string, days: number): string {
  const parsed = new Date(`${date}T12:00:00Z`)
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return parsed.toISOString().slice(0, 10)
}

/**
 * Mid-sentence form: "today" / "tomorrow" lowercase, but a real date keeps its
 * capitals. Lowercasing `describeDate` wholesale produced "thursday, august 20".
 */
export function describeDateInline(date: string): string {
  const label = describeDate(date)
  return ['Today', 'Tomorrow', 'Yesterday'].includes(label) ? label.toLowerCase() : label
}

/** "Today", "Tomorrow", "Yesterday", else "Saturday, 8 August". */
export function describeDate(date: string): string {
  const today = todayISO()
  if (date === today) return 'Today'
  if (date === shiftDate(today, 1)) return 'Tomorrow'
  if (date === shiftDate(today, -1)) return 'Yesterday'

  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}
