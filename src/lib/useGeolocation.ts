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

/*
 * Remembers a refusal so we don't re-ask on every page load. Browsers suppress a
 * repeat prompt anyway once denied, so asking again just produces a silent failure.
 */
const DENIED_KEY = 'adonis:geo-denied'

function readDenied(): boolean {
  try {
    return window.localStorage.getItem(DENIED_KEY) === '1'
  } catch {
    return false
  }
}

function writeDenied(denied: boolean): void {
  try {
    if (denied) window.localStorage.setItem(DENIED_KEY, '1')
    else window.localStorage.removeItem(DENIED_KEY)
  } catch {
    // Private mode; the in-memory state still works for this session.
  }
}

/**
 * Wraps the browser Geolocation API.
 *
 * Only works on a secure origin — https, or localhost.
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
        writeDenied(false)
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
          writeDenied(true)
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
   * Ask on load.
   *
   * This deliberately does NOT gate on the Permissions API. The previous version
   * only requested when permission was already 'granted', which meant a first-time
   * visitor sat at 'prompt' forever and the browser's own dialog never appeared —
   * so nobody was ever asked, and everyone silently got the fallback city. Safari
   * made it worse: it doesn't implement the Permissions API for geolocation at all,
   * so that check bailed before doing anything.
   *
   * Calling getCurrentPosition is what makes the browser ask. It needs no user
   * gesture, and for an app whose whole purpose is "what's near me", being asked
   * on arrival is what people expect.
   */
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({
        status: 'unavailable',
        coords: null,
        message: 'This browser cannot report your location.',
      })
      return
    }

    // Previously refused: show that state rather than firing a doomed request.
    if (readDenied()) {
      setState({
        status: 'denied',
        coords: null,
        message: 'Location permission was declined.',
      })
      return
    }

    request()
  }, [request])

  /** Clears the remembered refusal so the user can try again after re-allowing. */
  const retry = useCallback(() => {
    writeDenied(false)
    request()
  }, [request])

  return { ...state, request, retry }
}
