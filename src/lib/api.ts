import type { Category } from './types'

/** Everything goes through Vite's dev proxy, so cookies are same-origin. */
const BASE = '/api'

export interface ApiUser {
  id: string
  email: string
  displayName: string
}

export interface Place {
  id: string
  name: string
  category: Category
  lat: number
  lon: number
  neighborhood: string | null
  openingHours: string | null
  website: string | null
  phone: string | null
  /** true = costs money, false = explicitly free, null = OpenStreetMap doesn't say. */
  fee: boolean | null
  cuisine: string | null
  durationMin: number
  distanceKm?: number
}

export interface DayItem {
  id: string
  placeId: string
  startMin: number
}

export interface EventItem {
  id: string
  name: string
  date: string
  time: string | null
  venueName: string | null
  city: string | null
  lat: number | null
  lon: number | null
  distanceKm: number | null
  segment: string | null
  genre: string | null
  priceMin: number | null
  priceMax: number | null
  currency: string | null
  imageUrl: string | null
  url: string
}

export interface EventsResponse {
  events: EventItem[]
  count: number
  cached: boolean
  /** False when no events provider is set up — a normal state, not an error. */
  configured: boolean
  reason?: string
}

/** Thrown for any non-2xx response, carrying the server's own message. */
export class ApiError extends Error {
  // Assigned explicitly rather than as a parameter property, which
  // `erasableSyntaxOnly` disallows.
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response

  try {
    response = await fetch(`${BASE}${path}`, {
      // Session cookie must ride along on every call.
      credentials: 'same-origin',
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      ...init,
    })
  } catch {
    throw new ApiError('Could not reach the server. Is the API running?', 0)
  }

  const text = await response.text()
  const body: unknown = text ? JSON.parse(text) : {}

  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `Request failed (${response.status}).`
    throw new ApiError(message, response.status)
  }

  return body as T
}

/* -------------------------------------------------------------------------- */
/* Auth                                                                        */
/* -------------------------------------------------------------------------- */

export const api = {
  me: () => request<{ user: ApiUser | null }>('/auth/me'),

  signup: (email: string, password: string, displayName: string) =>
    request<{ user: ApiUser }>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName }),
    }),

  login: (email: string, password: string) =>
    request<{ user: ApiUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),

  /* Places ---------------------------------------------------------------- */

  nearby: (lat: number, lon: number, radiusM: number) =>
    request<{ places: Place[]; cached: boolean; count: number; radiusM: number }>(
      `/places/nearby?lat=${lat}&lon=${lon}&radius=${radiusM}`,
    ),

  events: (lat: number, lon: number, radiusM: number) =>
    request<EventsResponse>(`/events/nearby?lat=${lat}&lon=${lon}&radius=${radiusM}`),

  reverseGeocode: (lat: number, lon: number) =>
    request<{ label: string; city: string | null; country: string | null }>(
      `/geo/reverse?lat=${lat}&lon=${lon}`,
    ),

  /* The day --------------------------------------------------------------- */

  getDay: () => request<{ day: string; items: DayItem[]; places: Place[] }>('/day'),

  addToDay: (placeId: string, startMin: number) =>
    request<DayItem>('/day', { method: 'POST', body: JSON.stringify({ placeId, startMin }) }),

  moveDayItem: (id: string, startMin: number) =>
    request<{ ok: true }>(`/day/${id}`, { method: 'PATCH', body: JSON.stringify({ startMin }) }),

  removeDayItem: (id: string) => request<{ ok: true }>(`/day/${id}`, { method: 'DELETE' }),

  clearDay: () => request<{ ok: true }>('/day', { method: 'DELETE' }),

  /* Saved ----------------------------------------------------------------- */

  getSaved: () => request<{ ids: string[]; places: Place[] }>('/saved'),

  save: (itemId: string) =>
    request<{ ok: true }>('/saved', { method: 'PUT', body: JSON.stringify({ itemId }) }),

  unsave: (itemId: string) =>
    request<{ ok: true }>(`/saved?itemId=${encodeURIComponent(itemId)}`, { method: 'DELETE' }),
}
