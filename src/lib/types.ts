/** Must stay in step with CATEGORIES in server/src/places.ts. */
export type Category =
  | 'outdoors'
  | 'water'
  | 'food'
  | 'wellness'
  | 'culture'
  | 'nightlife'
  | 'creative'
  | 'market'

/**
 * Vacation spots stay curated rather than coming from OpenStreetMap: "somewhere
 * worth a week of your life" is an editorial judgement, not a map feature.
 */
export interface Destination {
  id: string
  name: string
  region: string
  country: string
  blurb: string
  nightlyFrom: number
  flightHours: number
  bestMonths: string
  avgTempC: number
  rating: number
  reviewCount: number
  vibes: string[]
  seed: number
}

export type ViewId = 'today' | 'explore' | 'escapes' | 'saved'
