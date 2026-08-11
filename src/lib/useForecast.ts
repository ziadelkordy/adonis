import { useEffect, useState } from 'react'
import { api } from './api'

export interface DayWeather {
  date: string
  code: number
  label: string
  emoji: string
  highC: number
  lowC: number
  highF: number
  lowF: number
  rainChance: number
  sunrise: string | null
  sunset: string | null
}

export interface HourWeather {
  hour: number
  tempC: number
  tempF: number
  rainChance: number
  code: number
}

export interface Forecast {
  timezone: string
  days: DayWeather[]
  hours: Record<string, HourWeather[]>
}

/**
 * The forecast for wherever the user is planning.
 *
 * Refetched only when the location moves, not when the date changes: one request
 * already covers a week, so paging through days costs nothing further. A failure
 * resolves to null rather than an error state — weather is an aid to planning, and
 * the day itself must still be usable without it.
 */
export function useForecast(lat: number, lon: number) {
  const [forecast, setForecast] = useState<Forecast | null>(null)

  /*
   * Rounded to ~1km before becoming a dependency, so GPS jitter can't trigger a
   * refetch on every reading. Extracted rather than rounded inline in the
   * dependency array, which is not statically checkable — the effect then reads
   * these instead of the raw props so the two can never drift apart.
   */
  const roundedLat = Number(lat.toFixed(2))
  const roundedLon = Number(lon.toFixed(2))

  useEffect(() => {
    let cancelled = false

    api
      .weather(roundedLat, roundedLon)
      .then((result) => {
        if (!cancelled) setForecast(result)
      })
      .catch(() => {
        if (!cancelled) setForecast(null)
      })

    return () => {
      cancelled = true
    }
  }, [roundedLat, roundedLon])

  return forecast
}

/** The forecast for one date, or null when it's outside the week covered. */
export function dayForecast(forecast: Forecast | null, date: string): DayWeather | null {
  return forecast?.days.find((day) => day.date === date) ?? null
}

/**
 * Rain chance at a given time of day, for warning about an outdoor plan.
 *
 * Falls back to null rather than 0 when the hour isn't covered, so "no data" can't
 * be mistaken for "no rain".
 */
export function rainChanceAt(
  forecast: Forecast | null,
  date: string,
  startMinute: number,
): number | null {
  const hours = forecast?.hours[date]
  if (!hours) return null
  const hour = Math.floor(startMinute / 60)
  return hours.find((entry) => entry.hour === hour)?.rainChance ?? null
}
