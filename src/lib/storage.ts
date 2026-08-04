import { ACTIVITY_BY_ID, DESTINATIONS } from './data'
import type { ScheduledItem } from './types'

/** Bump when the shape below changes — old payloads are then ignored, not crashed on. */
const STORAGE_KEY = 'sundial:state:v1'

export interface PersistedState {
  day: ScheduledItem[]
  saved: string[]
}

const VALID_SAVE_IDS = new Set<string>([
  ...ACTIVITY_BY_ID.keys(),
  ...DESTINATIONS.map((destination) => destination.id),
])

/**
 * Safari in private mode throws on `localStorage` access rather than returning
 * null, so every touch goes through a try/catch. Persistence is a nicety here:
 * if it is unavailable the app runs perfectly well in memory.
 */
function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Drops anything that no longer makes sense — an activity removed from the
 * catalogue, a malformed entry, a start time outside the day. Returning a
 * partially-valid day is better than discarding the whole thing.
 */
function parseDay(value: unknown): ScheduledItem[] {
  if (!Array.isArray(value)) return []

  const seenIds = new Set<string>()

  return value.flatMap((entry): ScheduledItem[] => {
    if (!isRecord(entry)) return []

    const { id, activityId, startMin } = entry
    if (typeof id !== 'string' || typeof activityId !== 'string') return []
    if (typeof startMin !== 'number' || !Number.isFinite(startMin)) return []
    if (startMin < 0 || startMin >= 24 * 60) return []
    if (!ACTIVITY_BY_ID.has(activityId)) return []
    if (seenIds.has(id)) return []

    seenIds.add(id)
    return [{ id, activityId, startMin: Math.round(startMin) }]
  })
}

function parseSaved(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((id): id is string => typeof id === 'string'))].filter((id) =>
    VALID_SAVE_IDS.has(id),
  )
}

/**
 * Returns null only when there is nothing usable stored — the caller uses that
 * to tell "first visit" (seed the starter day) from "deliberately cleared"
 * (an empty day that must stay empty across refreshes).
 */
export function loadState(): PersistedState | null {
  const raw = readRaw()
  if (!raw) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return null
    if (!Array.isArray(parsed.day) || !Array.isArray(parsed.saved)) return null

    return { day: parseDay(parsed.day), saved: parseSaved(parsed.saved) }
  } catch {
    // Corrupt payload — treat it as a first visit rather than blowing up.
    return null
  }
}

export function saveState(state: PersistedState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Quota exceeded or storage blocked: keep running from memory.
  }
}

export function clearState(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to do.
  }
}

/**
 * Placement ids look like `p-1004`. Restored items already occupy some of that
 * range, so the counter has to resume above the highest one or a freshly added
 * activity would collide with a restored one and duplicate its React key.
 */
export function highestPlacementId(day: ScheduledItem[]): number {
  return day.reduce((highest, item) => {
    const match = /^p-(\d+)$/.exec(item.id)
    if (!match) return highest
    return Math.max(highest, Number(match[1]))
  }, 0)
}
