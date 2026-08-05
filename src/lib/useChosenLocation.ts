import { useCallback, useState } from 'react'

export interface ChosenLocation {
  name: string
  label: string
  lat: number
  lon: number
}

/*
 * A location the user set by hand, which wins over both the browser and the
 * fallback city.
 *
 * The browser is not always able to say where you are: permission can be blocked
 * at the OS level rather than the site level, so the in-page "use my location"
 * button has nothing to re-ask; a desktop without GPS can be tens of kilometres
 * out; and a refusal is remembered by the browser, which then stops prompting.
 * Before this existed the only fallback was a fixed city, with no way out of it —
 * someone in Milpitas was shown Santa Monica restaurants labelled "0.1 km away".
 *
 * Persisted, because re-entering it on every visit would be its own annoyance.
 */
const STORAGE_KEY = 'adonis:chosen-location'

function read(): ChosenLocation | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ChosenLocation>
    if (
      typeof parsed.lat !== 'number' ||
      typeof parsed.lon !== 'number' ||
      typeof parsed.name !== 'string'
    ) {
      return null
    }
    return {
      name: parsed.name,
      label: typeof parsed.label === 'string' ? parsed.label : parsed.name,
      lat: parsed.lat,
      lon: parsed.lon,
    }
  } catch {
    // Corrupt entry or private mode. Falling back to "not set" is always safe.
    return null
  }
}

export function useChosenLocation() {
  const [chosen, setChosen] = useState<ChosenLocation | null>(read)

  const choose = useCallback((location: ChosenLocation) => {
    setChosen(location)
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(location))
    } catch {
      // Private mode; it still applies for this session.
    }
  }, [])

  const clear = useCallback(() => {
    setChosen(null)
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Nothing to undo if it was never written.
    }
  }, [])

  return { chosen, choose, clear }
}
