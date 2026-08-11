import type { Category } from './types'

/** Everything goes through Vite's dev proxy, so cookies are same-origin. */
const BASE = '/api'

export interface ApiUser {
  id: string
  email: string
  displayName: string
}

/** A verified photograph of a place. Null on most places — see PlaceImage. */
export interface Photo {
  url: string
  width: number
  height: number
  /** Ready to display: "Jane Doe / CC BY-SA 4.0", or null when Commons has none. */
  credit: string | null
  articleTitle: string
  articleUrl: string
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
  photo?: Photo | null
}

export interface DayItem {
  id: string
  /** Exactly one of these is set — a scheduled item is a place or an event. */
  placeId: string | null
  eventId: string | null
  startMin: number
}

/** An event snapshot stored server-side, so a plan survives it being delisted. */
export interface ScheduledEvent {
  id: string
  source: string
  name: string
  date: string
  /** Minutes from midnight, or null when no time was announced. */
  startMinutes: number | null
  venueName: string | null
  city: string | null
  lat: number | null
  lon: number | null
  segment: string | null
  genre: string | null
  priceMin: number | null
  priceMax: number | null
  currency: string | null
  imageUrl: string | null
  url: string
  durationMin: number
}

/** Turns a browsable event into the snapshot the server stores. */
export function toSnapshot(event: EventItem, durationMin = 150): Omit<ScheduledEvent, 'source'> & {
  source: string
} {
  const [hours, minutes] = (event.time ?? '').split(':')
  const startMinutes =
    event.time && Number.isFinite(Number(hours)) ? Number(hours) * 60 + Number(minutes ?? 0) : null

  return {
    id: event.id,
    source: event.source,
    name: event.name,
    date: event.date,
    startMinutes,
    venueName: event.venueName,
    city: event.city,
    lat: event.lat,
    lon: event.lon,
    segment: event.segment,
    genre: event.genre,
    priceMin: event.priceMin,
    priceMax: event.priceMax,
    currency: event.currency,
    imageUrl: event.imageUrl,
    url: event.url,
    durationMin,
  }
}

export interface EventItem {
  id: string
  /** 'espn' = keyless sports fixtures; 'ticketmaster' = ticketed listings. */
  source: 'espn' | 'ticketmaster'
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
  /** Which providers contributed to this response. */
  sources: { espn: boolean; ticketmaster: boolean }
  /**
   * Sports need no key. This is false when a Ticketmaster key would additionally
   * unlock comedy, music and theatre listings.
   */
  ticketingConfigured: boolean
  /** Venues still being geocoded in the background; more may appear shortly. */
  venuesPending: number
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

  escapes: (lat: number, lon: number, radiusM: number) =>
    request<{ places: Place[]; cached: boolean; count: number; radiusM: number }>(
      `/places/escapes?lat=${lat}&lon=${lon}&radius=${radiusM}`,
    ),

  events: (lat: number, lon: number, radiusM: number) =>
    request<EventsResponse>(`/events/nearby?lat=${lat}&lon=${lon}&radius=${radiusM}`),

  weather: (lat: number, lon: number) =>
    request<import('./useForecast').Forecast>(`/weather?lat=${lat}&lon=${lon}`),

  searchLocations: (query: string) =>
    request<{ matches: { name: string; label: string; lat: number; lon: number }[] }>(
      `/geo/search?q=${encodeURIComponent(query)}`,
    ),

  reverseGeocode: (lat: number, lon: number) =>
    request<{ label: string; city: string | null; country: string | null }>(
      `/geo/reverse?lat=${lat}&lon=${lon}`,
    ),

  /* The day --------------------------------------------------------------- */

  getDay: (day: string) =>
    request<{ day: string; items: DayItem[]; places: Place[]; events: ScheduledEvent[] }>(
      `/day?day=${day}`,
    ),

  addToDay: (placeId: string, startMin: number, day: string) =>
    request<DayItem>('/day', {
      method: 'POST',
      body: JSON.stringify({ placeId, startMin, day }),
    }),

  addEventToDay: (event: ReturnType<typeof toSnapshot>, startMin: number, day: string) =>
    request<DayItem>('/day', {
      method: 'POST',
      body: JSON.stringify({ event, startMin, day }),
    }),

  moveDayItem: (id: string, startMin: number) =>
    request<{ ok: true }>(`/day/${id}`, { method: 'PATCH', body: JSON.stringify({ startMin }) }),

  removeDayItem: (id: string) => request<{ ok: true }>(`/day/${id}`, { method: 'DELETE' }),

  clearDay: (day: string) => request<{ ok: true }>(`/day?day=${day}`, { method: 'DELETE' }),

  /* Saved ----------------------------------------------------------------- */

  getSaved: () =>
    request<{ ids: string[]; places: Place[]; events: ScheduledEvent[] }>('/saved'),

  save: (itemId: string) =>
    request<{ ok: true }>('/saved', { method: 'PUT', body: JSON.stringify({ itemId }) }),

  unsave: (itemId: string) =>
    request<{ ok: true }>(`/saved?itemId=${encodeURIComponent(itemId)}`, { method: 'DELETE' }),
}
