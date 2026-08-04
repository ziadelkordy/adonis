import { useCallback, useEffect, useState } from 'react'

export interface Coords {
  lat: number
  lon: number
  /** Metres of uncertainty, as reported by the browser. */
  accuracyM: number
}

export type GeoStatus = 'idle' | 'prompting' | 'granted' | 'denied' | 'unavailable' | 'error'

interface GeoState {
  status: GeoStatus
  coords: Coords | null
  message: string | null
}

/** Falls back to Santa Monica so the app is still usable without permission. */
export const FALLBACK_COORDS: Coords = { lat: 34.0195, lon: -118.4912, accuracyM: 0 }

/**
 * Wraps the browser Geolocation API.
 *
 * Note it only works on a secure origin — https, or localhost, which is why this
 * is fine in dev but needs TLS once deployed.
 */
export function useGeolocation() {
  const [state, setState] = useState<GeoState>({ status: 'idle', coords: null, message: null })

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({
        status: 'unavailable',
        coords: null,
        message: 'This browser cannot report your location.',
      })
      return
    }

    setState((current) => ({ ...current, status: 'prompting', message: null }))

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState({
          status: 'granted',
          coords: {
            lat: position.coords.latitude,
            lon: position.coords.longitude,
            accuracyM: position.coords.accuracy,
          },
          message: null,
        })
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setState({
            status: 'denied',
            coords: null,
            message: 'Location permission was declined.',
          })
          return
        }
        setState({
          status: 'error',
          coords: null,
          message:
            error.code === error.TIMEOUT
              ? 'Locating you took too long.'
              : 'Your location is unavailable right now.',
        })
      },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 5 * 60 * 1000 },
    )
  }, [])

  /*
   * Ask up front only if permission was already granted in a previous visit.
   * Otherwise wait for a deliberate click — an unprompted permission dialog on
   * first paint is hostile, and Safari doesn't support the Permissions query for
   * geolocation at all, which is why this is guarded rather than assumed.
   */
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return

    let cancelled = false
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((permission) => {
        if (!cancelled && permission.state === 'granted') request()
      })
      .catch(() => {
        // Permissions API unsupported — leave it to the user to click.
      })

    return () => {
      cancelled = true
    }
  }, [request])

  return { ...state, request }
}
