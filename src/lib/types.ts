export type Category =
  | 'outdoors'
  | 'water'
  | 'food'
  | 'wellness'
  | 'culture'
  | 'nightlife'
  | 'creative'
  | 'market'

export type TimeOfDay = 'morning' | 'afternoon' | 'evening'

/** 0 = free, 1 = $, 2 = $$, 3 = $$$ */
export type PriceTier = 0 | 1 | 2 | 3

export interface Activity {
  id: string
  title: string
  place: string
  neighborhood: string
  blurb: string
  category: Category
  priceTier: PriceTier
  /** Per person, in USD. 0 when free. */
  price: number
  durationMin: number
  rating: number
  reviewCount: number
  distanceKm: number
  timeOfDay: TimeOfDay[]
  outdoor: boolean
  tags: string[]
  /** Stable seed so an activity's generated artwork never changes between renders. */
  seed: number
}

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

/** An activity placed on the day's timeline. */
export interface ScheduledItem {
  /** Unique per placement — the same activity can be scheduled twice. */
  id: string
  activityId: string
  /** Minutes from midnight. */
  startMin: number
}

export type ViewId = 'today' | 'explore' | 'escapes' | 'saved'
