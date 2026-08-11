import type { Place } from './api'

/*
 * Outbound links for a place.
 *
 * OpenStreetMap records a website for only about a quarter of places — measured
 * around Milpitas, 251 of 335 had none, and 194 of those were restaurants, which
 * are exactly the ones you most want to look up before going. Leaving those cards
 * with no way out is the gap this closes.
 */

/**
 * Words that make a search query worse, not better.
 *
 * A locality is only useful for narrowing when it names somewhere real. OSM's
 * `addr:city` is sometimes a repeat of the place's own name, which just doubles a
 * word in the query.
 */
function localityFor(place: Place): string | null {
  const locality = place.neighborhood?.trim()
  if (!locality) return null
  if (locality.toLowerCase() === place.name.trim().toLowerCase()) return null
  return locality
}

/**
 * A web search for a place, narrowed by where it is.
 *
 * The locality matters more than it looks: "El Torito" or "Peet's Coffee" alone
 * return a chain's national homepage or a different branch entirely, while
 * "El Torito Milpitas" reaches the actual one.
 *
 * Only worth using when a locality exists — see lookupLinkFor, which routes a
 * place with no locality to the map instead, where its coordinates can do the
 * narrowing that its name cannot.
 */
export function searchUrlFor(place: Place): string {
  const locality = localityFor(place)
  const query = [place.name, locality].filter(Boolean).join(' ')
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`
}

/**
 * The place on a map, by name and locality rather than raw coordinates.
 *
 * A name query lands on the map provider's own record for the place — reviews,
 * hours, photos, directions — where a lat/lon pin is just a dot on a map with no
 * information attached. Coordinates are appended so an ambiguous name still
 * resolves to the right spot.
 */
export function mapsUrlFor(place: Place): string {
  const locality = localityFor(place)
  const query = [place.name, locality].filter(Boolean).join(' ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    query,
  )}&center=${place.lat},${place.lon}`
}

/**
 * The single best "tell me more about this place" link, and what to call it.
 *
 * Three cases, because the best target genuinely differs:
 *
 *   - A recorded website wins outright.
 *   - Otherwise a web search, when OSM knows the locality to narrow it with.
 *   - Otherwise the map, because a bare-name web search is close to useless for
 *     the names this actually happens to. Observed live: a place called
 *     "Solidarity" with no locality recorded produced the query "Solidarity",
 *     which finds anything but the restaurant. The map has the coordinates and so
 *     needs no help from the name at all.
 */
export function lookupLinkFor(place: Place): { href: string; label: string } {
  if (place.website) return { href: place.website, label: 'Visit website' }
  if (localityFor(place)) return { href: searchUrlFor(place), label: 'Search the web' }
  return { href: mapsUrlFor(place), label: 'Find on the map' }
}
