/*
 * Weather for a planned day, from Open-Meteo.
 *
 * Chosen because it needs no key at all, which matters here: the ticketing
 * integration already sits switched off waiting for someone to register for one,
 * and a day planner that cannot say whether it will rain is missing something far
 * more basic than concert listings.
 *
 * Both temperature scales are returned rather than picking one. Guessing from
 * coordinates gets it wrong for anyone travelling, and a unit toggle is a setting
 * to build, store and forget — sending two numbers costs nothing and lets the UI
 * decide.
 */

/** Rounded to ~1km, so nearby requests share a cache entry. */
function cacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`
}

/*
 * Forecasts are revised a few times a day, so a short TTL is plenty and keeps a
 * shared instance from re-fetching per browse. In memory rather than in Postgres:
 * it is cheap to refetch, worthless once stale, and not worth a migration.
 */
const TTL_MS = 30 * 60 * 1000
const cache = new Map<string, { at: number; value: Forecast }>()

export interface DayWeather {
  /** YYYY-MM-DD in the location's own timezone. */
  date: string
  code: number
  label: string
  emoji: string
  highC: number
  lowC: number
  highF: number
  lowF: number
  /** Percent chance of precipitation at any point in the day. */
  rainChance: number
  sunrise: string | null
  sunset: string | null
}

export interface HourWeather {
  /** Local hour, 0-23. */
  hour: number
  tempC: number
  tempF: number
  rainChance: number
  code: number
}

export interface Forecast {
  timezone: string
  days: DayWeather[]
  /** Keyed by date, so a scheduled item can be checked against its own hour. */
  hours: Record<string, HourWeather[]>
}

/*
 * WMO weather codes. Grouped rather than enumerated one-to-one: the distinction
 * between "slight" and "moderate" drizzle does not change anybody's plan, while
 * rain-versus-thunderstorm very much does.
 */
const CONDITIONS: { codes: number[]; label: string; emoji: string }[] = [
  { codes: [0], label: 'Clear', emoji: '☀️' },
  { codes: [1], label: 'Mostly clear', emoji: '🌤️' },
  { codes: [2], label: 'Partly cloudy', emoji: '⛅' },
  { codes: [3], label: 'Overcast', emoji: '☁️' },
  { codes: [45, 48], label: 'Fog', emoji: '🌫️' },
  { codes: [51, 53, 55, 56, 57], label: 'Drizzle', emoji: '🌦️' },
  { codes: [61, 63, 65, 66, 67], label: 'Rain', emoji: '🌧️' },
  { codes: [71, 73, 75, 77, 85, 86], label: 'Snow', emoji: '🌨️' },
  { codes: [80, 81, 82], label: 'Showers', emoji: '🌦️' },
  { codes: [95, 96, 99], label: 'Thunderstorms', emoji: '⛈️' },
]

export function describeCode(code: number): { label: string; emoji: string } {
  for (const condition of CONDITIONS) {
    if (condition.codes.includes(code)) return { label: condition.label, emoji: condition.emoji }
  }
  // Unknown code: say so plainly rather than inventing a condition.
  return { label: 'Unknown', emoji: '🌡️' }
}

function toF(celsius: number): number {
  return Math.round((celsius * 9) / 5 + 32)
}

/** "2026-08-11T20:04" -> "20:04". Open-Meteo returns local time, not UTC. */
function timeOnly(value: string | null | undefined): string | null {
  if (!value) return null
  const parts = value.split('T')
  return parts[1]?.slice(0, 5) ?? null
}

interface OpenMeteoResponse {
  timezone?: string
  daily?: {
    time?: string[]
    weather_code?: number[]
    temperature_2m_max?: number[]
    temperature_2m_min?: number[]
    precipitation_probability_max?: (number | null)[]
    sunrise?: string[]
    sunset?: string[]
  }
  hourly?: {
    time?: string[]
    temperature_2m?: number[]
    precipitation_probability?: (number | null)[]
    weather_code?: number[]
  }
}

export class WeatherUnavailableError extends Error {}

export async function fetchForecast(lat: number, lon: number): Promise<Forecast> {
  const key = cacheKey(lat, lon)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value

  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset' +
    '&hourly=temperature_2m,precipitation_probability,weather_code' +
    '&timezone=auto&forecast_days=7'

  let payload: OpenMeteoResponse
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(12_000) })
    if (!response.ok) throw new WeatherUnavailableError(`upstream returned ${response.status}`)
    payload = (await response.json()) as OpenMeteoResponse
  } catch (error) {
    if (error instanceof WeatherUnavailableError) throw error
    throw new WeatherUnavailableError('forecast service did not respond')
  }

  const daily = payload.daily
  if (!daily?.time?.length) throw new WeatherUnavailableError('forecast contained no days')

  const days: DayWeather[] = daily.time.map((date, index) => {
    const code = daily.weather_code?.[index] ?? -1
    const { label, emoji } = describeCode(code)
    const highC = Math.round(daily.temperature_2m_max?.[index] ?? 0)
    const lowC = Math.round(daily.temperature_2m_min?.[index] ?? 0)
    return {
      date,
      code,
      label,
      emoji,
      highC,
      lowC,
      highF: toF(highC),
      lowF: toF(lowC),
      rainChance: daily.precipitation_probability_max?.[index] ?? 0,
      sunrise: timeOnly(daily.sunrise?.[index]),
      sunset: timeOnly(daily.sunset?.[index]),
    }
  })

  const hours: Record<string, HourWeather[]> = {}
  const hourly = payload.hourly
  for (const [index, stamp] of (hourly?.time ?? []).entries()) {
    const [date, clock] = stamp.split('T')
    if (!date || !clock) continue
    const tempC = Math.round(hourly?.temperature_2m?.[index] ?? 0)
    ;(hours[date] ??= []).push({
      hour: Number(clock.slice(0, 2)),
      tempC,
      tempF: toF(tempC),
      rainChance: hourly?.precipitation_probability?.[index] ?? 0,
      code: hourly?.weather_code?.[index] ?? -1,
    })
  }

  const forecast: Forecast = { timezone: payload.timezone ?? 'UTC', days, hours }
  cache.set(key, { at: Date.now(), value: forecast })
  return forecast
}
