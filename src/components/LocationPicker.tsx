import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import type { ChosenLocation } from '@/lib/useChosenLocation'
import { PinIcon, SunIcon } from './icons'
import { Button } from './ui'

/*
 * Setting a location by typing its name.
 *
 * This is the escape hatch for every case the browser can't handle: permission
 * blocked at the OS level (where the in-page button has nothing left to ask),
 * a desktop with no GPS placing you in the wrong city, or simply wanting to plan
 * a day somewhere you aren't yet. Without it the app pins you to a fallback city
 * with no way out.
 */

interface LocationPickerProps {
  onChoose: (location: ChosenLocation) => void
  onClose: () => void
  /** Offered only when a hand-set location is currently in force. */
  onClear?: () => void
}

export function LocationPicker({ onChoose, onClose, onClear }: LocationPickerProps) {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<ChosenLocation[]>([])
  const [status, setStatus] = useState<'idle' | 'searching' | 'empty' | 'error'>('idle')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setMatches([])
      setStatus('idle')
      return
    }

    /*
     * Debounced, and hard-cancelled on the next keystroke. Nominatim asks callers
     * to stay near one request a second, and a request per character would both
     * breach that and let a slow early response overwrite a newer one.
     */
    let cancelled = false
    setStatus('searching')
    const timer = setTimeout(() => {
      api
        .searchLocations(trimmed)
        .then((result) => {
          if (cancelled) return
          setMatches(result.matches)
          setStatus(result.matches.length === 0 ? 'empty' : 'idle')
        })
        .catch(() => {
          if (!cancelled) setStatus('error')
        })
    }, 400)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink-900/35 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
      role="presentation"
    >
      {/*
       * A dialog inside the scrim, so a click on the panel doesn't close it.
       * The scrim keeps the click-to-dismiss.
       */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Set your location"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-shell bg-shell shadow-high"
      >
        <div className="border-ink-200/70 border-b p-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-ink-900">
              Where do you want to plan?
            </span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Milpitas, or a postcode, or a landmark"
              className="h-11 w-full rounded-full bg-cream px-4 text-sm text-ink-900 ring-1 ring-ink-200 ring-inset transition placeholder:text-ink-400 focus:ring-2 focus:ring-bloom-400 focus:outline-none"
            />
          </label>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {status === 'searching' && (
            <p className="px-4 py-6 text-center text-sm text-ink-500">Searching…</p>
          )}
          {status === 'empty' && (
            <p className="px-4 py-6 text-center text-sm text-ink-500">
              Nothing found for “{query.trim()}”. Try a town or a postcode.
            </p>
          )}
          {status === 'error' && (
            <p className="px-4 py-6 text-center text-sm text-bloom-600">
              The lookup service didn’t answer. Try again in a moment.
            </p>
          )}

          <ul>
            {matches.map((match) => (
              <li key={`${match.lat},${match.lon}`}>
                <button
                  type="button"
                  onClick={() => {
                    onChoose(match)
                    onClose()
                  }}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-sand/70"
                >
                  <PinIcon className="mt-0.5 size-4 shrink-0 text-bloom-400" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink-900">
                      {match.name}
                    </span>
                    <span className="block truncate text-xs text-ink-500">{match.label}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-ink-200/70 border-t bg-cream/60 p-3">
          {onClear ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                onClear()
                onClose()
              }}
            >
              <SunIcon className="size-4" />
              Use my device instead
            </Button>
          ) : (
            <span />
          )}
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
