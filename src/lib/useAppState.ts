import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ApiError,
  type ApiUser,
  type DayItem,
  type EventItem,
  type Place,
  type ScheduledEvent,
  api,
  toSnapshot,
} from './api'
import { type Router, describeDateInline, todayISO } from './router'
import { FALLBACK_COORDS, useGeolocation } from './useGeolocation'

export const DAY_START_MIN = 6 * 60
export const DAY_END_MIN = 24 * 60

const WINDOW_ORDER: Array<[number, number]> = [
  [9 * 60, 12 * 60],
  [12 * 60, 17 * 60],
  [17 * 60, 22 * 60],
]

/** Buffer between activities so an auto-planned day never reads as back-to-back. */
const GAP_MIN = 15
const SLOT_STEP_MIN = 15

export const RADIUS_OPTIONS = [
  { value: 1000, label: '1 km' },
  { value: 2000, label: '2 km' },
  { value: 5000, label: '5 km' },
  { value: 10_000, label: '10 km' },
]

export interface Toast {
  id: number
  message: string
  tone: 'success' | 'warning'
}

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

interface Placed {
  start: number
  end: number
}

function fitsAt(start: number, duration: number, ranges: Placed[], gap = GAP_MIN): boolean {
  if (start + duration > DAY_END_MIN) return false
  return ranges.every((range) => start + duration + gap <= range.start || start >= range.end + gap)
}

export function useAppState(router: Router) {
  /* The visible day comes from the URL, so a plan for a specific date can be
     linked, refreshed and reached with the back button. */
  const date = router.route.date ?? todayISO()

  /* Auth ------------------------------------------------------------------ */
  const [user, setUser] = useState<ApiUser | null>(null)
  const [authStatus, setAuthStatus] = useState<LoadStatus>('loading')

  /* Location -------------------------------------------------------------- */
  const geo = useGeolocation()
  const [locationLabel, setLocationLabel] = useState<string | null>(null)
  const [radiusM, setRadiusM] = useState(2000)

  /* Nearby places --------------------------------------------------------- */
  const [places, setPlaces] = useState<Place[]>([])
  const [placesStatus, setPlacesStatus] = useState<LoadStatus>('idle')
  const [placesError, setPlacesError] = useState<string | null>(null)
  const [servedFromCache, setServedFromCache] = useState(false)

  /* User data ------------------------------------------------------------- */
  const [dayItems, setDayItems] = useState<DayItem[]>([])
  const [dayPlaces, setDayPlaces] = useState<Place[]>([])
  const [dayEvents, setDayEvents] = useState<ScheduledEvent[]>([])
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [savedPlaces, setSavedPlaces] = useState<Place[]>([])
  const [savedEvents, setSavedEvents] = useState<ScheduledEvent[]>([])

  const [toast, setToast] = useState<Toast | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ id: Date.now(), message, tone })
    toastTimer.current = setTimeout(() => setToast(null), 3600)
  }, [])

  /** Whether we're showing real device coordinates or the fallback city. */
  const usingFallbackLocation = geo.coords === null
  const coords = geo.coords ?? FALLBACK_COORDS

  /* ---------------------------------------------------------------------- */
  /* Session                                                                */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false

    api
      .me()
      .then((result) => {
        if (!cancelled) {
          setUser(result.user)
          setAuthStatus('ready')
        }
      })
      .catch(() => {
        if (!cancelled) setAuthStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [])

  const loadUserData = useCallback(async () => {
    const [day, saved] = await Promise.all([api.getDay(date), api.getSaved()])
    setDayItems(day.items)
    setDayPlaces(day.places)
    setDayEvents(day.events)
    setSavedIds(new Set(saved.ids))
    setSavedPlaces(saved.places)
    setSavedEvents(saved.events)
  }, [date])

  // Pull the signed-in user's day and saved items; clear them again on sign-out.
  useEffect(() => {
    if (!user) {
      setDayItems([])
      setDayPlaces([])
      setDayEvents([])
      setSavedIds(new Set())
      setSavedPlaces([])
      setSavedEvents([])
      return
    }

    let cancelled = false
    loadUserData().catch(() => {
      if (!cancelled) showToast('Could not load your saved data.', 'warning')
    })

    return () => {
      cancelled = true
    }
  }, [user, loadUserData, showToast])

  /* ---------------------------------------------------------------------- */
  /* Location name + nearby places                                          */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false

    api
      .reverseGeocode(coords.lat, coords.lon)
      .then((result) => {
        if (!cancelled) setLocationLabel(result.label)
      })
      .catch(() => {
        if (!cancelled) setLocationLabel(null)
      })

    return () => {
      cancelled = true
    }
  }, [coords.lat, coords.lon])

  const loadNearby = useCallback(async () => {
    setPlacesStatus('loading')
    setPlacesError(null)

    try {
      const result = await api.nearby(coords.lat, coords.lon, radiusM)
      setPlaces(result.places)
      setServedFromCache(result.cached)
      setPlacesStatus('ready')
    } catch (error) {
      setPlacesError(
        error instanceof ApiError ? error.message : 'Could not load nearby places.',
      )
      setPlacesStatus('error')
    }
  }, [coords.lat, coords.lon, radiusM])

  useEffect(() => {
    void loadNearby()
  }, [loadNearby])

  /* ---------------------------------------------------------------------- */
  /* Place lookup                                                           */
  /* ---------------------------------------------------------------------- */

  /**
   * Nearby results don't necessarily contain a scheduled or saved place — the
   * user may have moved, or changed the radius. Merging all three sources means
   * every view can resolve a place id without another request.
   */
  const placeById = useMemo(() => {
    const map = new Map<string, Place>()
    for (const place of [...dayPlaces, ...savedPlaces, ...places]) {
      map.set(place.id, place)
    }
    return map
  }, [dayPlaces, savedPlaces, places])

  /** Scheduled and saved event snapshots, for rendering without a refetch. */
  const eventById = useMemo(() => {
    const map = new Map<string, ScheduledEvent>()
    for (const event of [...dayEvents, ...savedEvents]) map.set(event.id, event)
    return map
  }, [dayEvents, savedEvents])

  const scheduledPlaceIds = useMemo(
    () => new Set(dayItems.flatMap((item) => (item.placeId ? [item.placeId] : []))),
    [dayItems],
  )

  /** Which events are on *any* day, so Explore can mark them as already planned. */
  const scheduledEventIds = useMemo(
    () => new Set(dayItems.flatMap((item) => (item.eventId ? [item.eventId] : []))),
    [dayItems],
  )

  /* ---------------------------------------------------------------------- */
  /* Auth actions                                                           */
  /* ---------------------------------------------------------------------- */

  const signup = useCallback(
    async (email: string, password: string, displayName: string) => {
      const result = await api.signup(email, password, displayName)
      setUser(result.user)
      showToast(`Welcome, ${result.user.displayName}.`)
    },
    [showToast],
  )

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await api.login(email, password)
      setUser(result.user)
      showToast(`Welcome back, ${result.user.displayName}.`)
    },
    [showToast],
  )

  const logout = useCallback(async () => {
    await api.logout()
    setUser(null)
    // Back to Today, since Saved and the planner both require an account.
    router.update({ section: 'today', detail: null })
    showToast('Signed out.')
  }, [showToast, router])

  /* ---------------------------------------------------------------------- */
  /* Day actions                                                            */
  /* ---------------------------------------------------------------------- */

  /** How long a scheduled item occupies, whichever kind it is. */
  const durationOf = useCallback(
    (item: DayItem): number | null => {
      if (item.placeId) return placeById.get(item.placeId)?.durationMin ?? null
      if (item.eventId) return eventById.get(item.eventId)?.durationMin ?? null
      return null
    },
    [placeById, eventById],
  )

  const occupied = useMemo<Placed[]>(
    () =>
      dayItems
        .map((item) => {
          const duration = durationOf(item)
          return duration === null ? null : { start: item.startMin, end: item.startMin + duration }
        })
        .filter((range): range is Placed => range !== null)
        .sort((a, b) => a.start - b.start),
    [dayItems, durationOf],
  )

  /** Earliest opening that fits, preferring daytime windows. */
  const findSlot = useCallback(
    (durationMin: number): number | null => {
      for (const [from, to] of WINDOW_ORDER) {
        for (let start = from; start <= to; start += SLOT_STEP_MIN) {
          if (fitsAt(start, durationMin, occupied)) return start
        }
      }
      for (let start = DAY_START_MIN; start <= DAY_END_MIN - durationMin; start += SLOT_STEP_MIN) {
        if (fitsAt(start, durationMin, occupied)) return start
      }
      return null
    },
    [occupied],
  )

  const addToDay = useCallback(
    async (place: Place) => {
      if (!user) {
        showToast('Sign in to plan your day.', 'warning')
        return
      }

      const start = findSlot(place.durationMin)
      if (start === null) {
        showToast('No room left today — try removing something first.', 'warning')
        return
      }

      try {
        await api.addToDay(place.id, start, date)
        await loadUserData()
        showToast(`Added “${place.name}” to your day.`)
      } catch (error) {
        showToast(
          error instanceof ApiError ? error.message : 'Could not add that.',
          'warning',
        )
      }
    },
    [user, findSlot, loadUserData, showToast, date],
  )

  const removeFromDay = useCallback(
    async (itemId: string) => {
      try {
        await api.removeDayItem(itemId)
        await loadUserData()
        showToast('Removed from your day.')
      } catch {
        showToast('Could not remove that.', 'warning')
      }
    },
    [loadUserData, showToast],
  )

  const moveInDay = useCallback(
    async (itemId: string, deltaMin: number) => {
      const item = dayItems.find((entry) => entry.id === itemId)
      const duration = item ? durationOf(item) : null
      if (!item || duration === null) return

      const nextStart = item.startMin + deltaMin

      if (nextStart < DAY_START_MIN || nextStart + duration > DAY_END_MIN) {
        showToast('That would push it outside the day.', 'warning')
        return
      }

      /*
       * Rebuild the occupied ranges excluding this item *by id*. Filtering the
       * memoised list by matching start/end would also drop any other item that
       * happened to occupy the identical span.
       */
      const others = dayItems
        .filter((entry) => entry.id !== itemId)
        .map((entry) => {
          const otherDuration = durationOf(entry)
          return otherDuration === null
            ? null
            : { start: entry.startMin, end: entry.startMin + otherDuration }
        })
        .filter((range): range is Placed => range !== null)

      // A deliberate nudge only needs to avoid a real overlap; the 15-minute
      // buffer is for automatic placement.
      if (!fitsAt(nextStart, duration, others, 0)) {
        showToast('That would run into something else.', 'warning')
        return
      }

      try {
        await api.moveDayItem(itemId, nextStart)
        await loadUserData()
      } catch {
        showToast('Could not move that.', 'warning')
      }
    },
    [dayItems, durationOf, loadUserData, showToast],
  )

  /**
   * Events land on their own date at their own start time — unlike a place, a
   * fixture happens when it happens, so `findSlot` doesn't apply. If that clashes
   * with something already planned, it is nudged to the next opening rather than
   * silently double-booking.
   */
  const addEventToDay = useCallback(
    async (event: EventItem) => {
      if (!user) {
        showToast('Sign in to plan your day.', 'warning')
        return
      }

      const snapshot = toSnapshot(event)
      const preferred = snapshot.startMinutes

      // Occupancy is only known for the day currently loaded.
      const sameDay = event.date === date
      const ranges = sameDay ? occupied : []

      let start = preferred ?? 12 * 60
      if (!fitsAt(start, snapshot.durationMin, ranges, 0)) {
        let bumped: number | null = null
        for (let candidate = start; candidate <= DAY_END_MIN; candidate += SLOT_STEP_MIN) {
          if (fitsAt(candidate, snapshot.durationMin, ranges)) {
            bumped = candidate
            break
          }
        }
        if (bumped === null) {
          showToast('That day is full — try removing something first.', 'warning')
          return
        }
        start = bumped
      }

      try {
        await api.addEventToDay(snapshot, start, event.date)

        // Jump to the day it landed on; otherwise the confirmation is invisible.
        if (!sameDay) router.update({ section: 'today', date: event.date })
        else await loadUserData()

        showToast(`Added “${event.name}” to ${describeDateInline(event.date)}.`)
      } catch (error) {
        showToast(
          error instanceof ApiError ? error.message : 'Could not add that event.',
          'warning',
        )
      }
    },
    [user, date, occupied, loadUserData, showToast, router],
  )

  const clearDay = useCallback(async () => {
    try {
      await api.clearDay(date)
      await loadUserData()
      showToast('Cleared the day. Blank slate.')
    } catch {
      showToast('Could not clear the day.', 'warning')
    }
    // `date` matters: without it this closes over whichever day was showing when
    // the callback was created, and clears that one instead of the current one.
  }, [loadUserData, showToast, date])

  /* ---------------------------------------------------------------------- */
  /* Saved                                                                  */
  /* ---------------------------------------------------------------------- */

  const toggleSaved = useCallback(
    async (itemId: string) => {
      if (!user) {
        showToast('Sign in to save things.', 'warning')
        return
      }

      const wasSaved = savedIds.has(itemId)

      // Optimistic: the heart should respond instantly, then reconcile.
      setSavedIds((current) => {
        const next = new Set(current)
        if (wasSaved) next.delete(itemId)
        else next.add(itemId)
        return next
      })

      try {
        if (wasSaved) await api.unsave(itemId)
        else await api.save(itemId)
        const saved = await api.getSaved()
        setSavedIds(new Set(saved.ids))
        setSavedPlaces(saved.places)
      } catch {
        setSavedIds((current) => {
          const next = new Set(current)
          if (wasSaved) next.add(itemId)
          else next.delete(itemId)
          return next
        })
        showToast('Could not update your saved items.', 'warning')
      }
    },
    [user, savedIds, showToast],
  )

  return {
    /** Where we are, and how to move — both straight from the URL. */
    route: router.route,
    router,
    date,
    setDate: (next: string) => router.update({ section: 'today', date: next }),
    setView: (section: 'today' | 'explore' | 'escapes' | 'saved') => router.update({ section }),
    openDetail: (id: string | null) => router.update({ detail: id }),

    user,
    authStatus,
    signup,
    login,
    logout,

    geo,
    coords,
    usingFallbackLocation,
    locationLabel,
    radiusM,
    setRadiusM,

    places,
    placesStatus,
    placesError,
    servedFromCache,
    reloadNearby: loadNearby,

    dayItems,
    dayEvents,
    savedIds,
    savedPlaces,
    savedEvents,
    placeById,
    eventById,
    scheduledPlaceIds,
    scheduledEventIds,
    durationOf,

    addToDay,
    addEventToDay,
    removeFromDay,
    moveInDay,
    clearDay,
    toggleSaved,

    toast,
  }
}

export type AppState = ReturnType<typeof useAppState>
