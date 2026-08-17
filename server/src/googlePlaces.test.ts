/*
 * The type arrays here are the shapes Google actually returns — a place carries
 * many types at once, which is exactly why order matters in the mapping table.
 */

import { describe, expect, it } from 'vitest'
import { categoryFor, feeFor } from './googlePlaces.ts'

describe('categoryFor', () => {
  it('prefers the specific type over the generic one it also carries', () => {
    // A theme park is also a tourist_attraction; "fun" is right either way, but a
    // museum is a tourist_attraction too and must not be read as generic fun.
    expect(categoryFor(['museum', 'tourist_attraction', 'point_of_interest'])).toBe('culture')
    expect(categoryFor(['amusement_park', 'tourist_attraction'])).toBe('fun')
  })

  it('reads a brewery as nightlife rather than food', () => {
    // Carries both; the narrower reading is the useful one for planning an evening.
    expect(categoryFor(['bar', 'restaurant', 'food'])).toBe('nightlife')
  })

  it('honours primaryType when it disagrees with the type list order', () => {
    expect(categoryFor(['restaurant', 'point_of_interest'], 'coffee_shop')).toBe('food')
  })

  it('maps the outdoor and water types apart', () => {
    expect(categoryFor(['national_park', 'park'])).toBe('outdoors')
    expect(categoryFor(['beach'])).toBe('water')
    // A water park is an amusement park with slides. Matches the OSM path, which
    // classifies leisure=water_park as fun — the providers must not disagree.
    expect(categoryFor(['water_park', 'amusement_park'])).toBe('fun')
    expect(categoryFor(['marina'])).toBe('water')
  })

  it('returns null for types we deliberately do not show', () => {
    // A petrol station or a dentist is not somewhere to spend an afternoon.
    expect(categoryFor(['gas_station', 'point_of_interest'])).toBeNull()
    expect(categoryFor(['dentist', 'health'])).toBeNull()
    expect(categoryFor([])).toBeNull()
  })
})

describe('feeFor', () => {
  it('treats only an explicit free rating as free', () => {
    expect(feeFor('PRICE_LEVEL_FREE')).toBe(false)
  })

  it('treats any paid rating as costing money', () => {
    expect(feeFor('PRICE_LEVEL_INEXPENSIVE')).toBe(true)
    expect(feeFor('PRICE_LEVEL_VERY_EXPENSIVE')).toBe(true)
  })

  it('keeps "unknown" distinct from "free"', () => {
    // Claiming a place is free because Google didn't say would be a lie.
    expect(feeFor('PRICE_LEVEL_UNSPECIFIED')).toBeNull()
    expect(feeFor(undefined)).toBeNull()
  })
})
