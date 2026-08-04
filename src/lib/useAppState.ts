import { useCallback, useMemo, useRef, useState } from 'react'
import { ACTIVITY_BY_ID, STARTER_DAY } from './data'
import type { Activity, ScheduledItem, TimeOfDay, ViewId } from './types'

export const DAY_START_MIN = 6 * 60
export const DAY_END_MIN = 24 * 60

const WINDOWS: Record<TimeOfDay, [number, number]> = {
  morning: [6 * 60, 12 * 60],
  afternoon: [12 * 60, 17 * 60],
  evening: [17 * 60, 23 * 60 + 30],
}

/** Buffer between activities so the day never reads as back-to-back. */
const GAP_MIN = 15
const SLOT_STEP_MIN = 15

interface Placed {
  start: number
  end: number
}

function occupiedRanges(day: ScheduledItem[]): Placed[] {
  return day
    .map((item) => {
      const activity = ACTIVITY_BY_ID.get(item.activityId)
      return activity
        ? { start: item.startMin, end: item.startMin + activity.durationMin }
        : null
    })
    .filter((range): range is Placed => range !== null)
    .sort((a, b) => a.start - b.start)
}

/**
 * `gap` is the breathing room required either side. Automatic placement asks for
 * GAP_MIN so a generated day never reads as back-to-back; a deliberate manual
 * nudge passes 0, since only a real overlap should stop the user.
 */
function fitsAt(start: number, duration: number, ranges: Placed[], gap = GAP_MIN): boolean {
  const end = start + duration
  if (end > DAY_END_MIN) return false
  return ranges.every((range) => end + gap <= range.start || start >= range.end + gap)
}

/**
 * Pick the earliest sensible start for an activity: prefer its own time-of-day
 * windows, fall back to anywhere in the day that fits.
 */
export function findSlot(activity: Activity, day: ScheduledItem[]): number | null {
  const ranges = occupiedRanges(day)
  const order: TimeOfDay[] = ['morning', 'afternoon', 'evening']
  const preferred = order.filter((slot) => activity.timeOfDay.includes(slot))

  for (const window of preferred) {
    const [from, to] = WINDOWS[window]
    for (let start = from; start <= to; start += SLOT_STEP_MIN) {
      if (fitsAt(start, activity.durationMin, ranges)) return start
    }
  }

  for (let start = DAY_START_MIN; start <= DAY_END_MIN - activity.durationMin; start += SLOT_STEP_MIN) {
    if (fitsAt(start, activity.durationMin, ranges)) return start
  }

  return null
}

export interface Toast {
  id: number
  message: string
  tone: 'success' | 'warning'
}

export function useAppState() {
  const [view, setView] = useState<ViewId>('today')
  const [day, setDay] = useState<ScheduledItem[]>(STARTER_DAY)
  const [saved, setSaved] = useState<Set<string>>(
    () => new Set(['a-sunrise-hike', 'd-amalfi', 'd-kauai']),
  )
  const [toast, setToast] = useState<Toast | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nextId = useRef(1000)

  const showToast = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ id: Date.now(), message, tone })
    toastTimer.current = setTimeout(() => setToast(null), 3200)
  }, [])

  const toggleSaved = useCallback((id: string) => {
    setSaved((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const scheduledActivityIds = useMemo(
    () => new Set(day.map((item) => item.activityId)),
    [day],
  )

  const addToDay = useCallback(
    (activity: Activity) => {
      // Resolve the slot against the committed `day` rather than inside the
      // updater — updaters run at render time, so their result isn't readable here.
      const start = findSlot(activity, day)

      if (start === null) {
        showToast('No room left today — try removing something first.', 'warning')
        return
      }

      nextId.current += 1
      const id = `p-${nextId.current}`
      setDay((current) => [...current, { id, activityId: activity.id, startMin: start }])
      showToast(`Added “${activity.title}” to your day.`)
    },
    [day, showToast],
  )

  const removeFromDay = useCallback(
    (itemId: string) => {
      setDay((current) => current.filter((item) => item.id !== itemId))
      showToast('Removed from your day.')
    },
    [showToast],
  )

  const moveInDay = useCallback(
    (itemId: string, deltaMin: number) => {
      const target = day.find((item) => item.id === itemId)
      const activity = target ? ACTIVITY_BY_ID.get(target.activityId) : undefined
      if (!target || !activity) return

      const nextStart = target.startMin + deltaMin

      if (nextStart < DAY_START_MIN || nextStart + activity.durationMin > DAY_END_MIN) {
        showToast('That would push it outside the day.', 'warning')
        return
      }

      const others = day.filter((item) => item.id !== itemId)
      if (!fitsAt(nextStart, activity.durationMin, occupiedRanges(others), 0)) {
        showToast('That would run into something else.', 'warning')
        return
      }

      setDay((current) =>
        current.map((item) => (item.id === itemId ? { ...item, startMin: nextStart } : item)),
      )
    },
    [day, showToast],
  )

  const clearDay = useCallback(() => {
    setDay([])
    showToast('Cleared the day. Blank slate.')
  }, [showToast])

  return {
    view,
    setView,
    day,
    saved,
    toast,
    scheduledActivityIds,
    toggleSaved,
    addToDay,
    removeFromDay,
    moveInDay,
    clearDay,
  }
}

export type AppState = ReturnType<typeof useAppState>
