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
  | 'fun'

export type ViewId = 'today' | 'explore' | 'escapes' | 'saved'
