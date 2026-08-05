/*
 * These cases are not hypothetical. Every rejection below is a real pairing that
 * a coordinate-only photo lookup returned while measuring against cached places
 * around Milpitas, and every acceptance is a real match it found. The point of
 * the suite is that loosening the matching to raise coverage — which is a
 * standing temptation, since coverage is low — has to break a test first.
 */

import { describe, expect, it } from 'vitest'
import {
  MAX_DISTANCE_KM,
  fileKey,
  haversineKm,
  isNonPhoto,
  isSettlementMismatch,
  titlesAgree,
} from './photos.ts'

describe('titlesAgree', () => {
  it('accepts the article about the place', () => {
    expect(titlesAgree('Ed R. Levin County Park', 'Ed R. Levin County Park')).toBe(true)
    expect(titlesAgree("California's Great America", "California's Great America")).toBe(true)
    expect(titlesAgree('Mission Peak', 'Mission Peak')).toBe(true)
  })

  it('tolerates the punctuation and joining words that differ between sources', () => {
    // OSM writes "and", Wikipedia writes "&" — the same place.
    expect(titlesAgree('Happy Hollow Park and Zoo', 'Happy Hollow Park & Zoo')).toBe(true)
  })

  it('rejects the nearby-but-different places geosearch actually returned', () => {
    expect(titlesAgree('Tom Evatt Park', 'Great Mall of the Bay Area')).toBe(false)
    expect(titlesAgree('Park Metro East Park', 'Flextronics - Milpitas HQ')).toBe(false)
    expect(titlesAgree("Peet's Coffee", 'Calaveras right of way preparation')).toBe(false)
    expect(titlesAgree('Milpitas Public Library', 'Milpitas Grammar School')).toBe(false)
    expect(titlesAgree('Hidden Lake Park', 'Milpitas, California')).toBe(false)
  })

  it('does not match on generic place words alone', () => {
    // Both are "parks"; nothing distinctive is shared, so this must not pass.
    expect(titlesAgree('Selwyn Park', 'Vargas Plateau Regional Park')).toBe(false)
    expect(titlesAgree('Veterans Plaza', 'Civic Center Plaza')).toBe(false)
  })

  it('rejects a name that survives only as a substring of a bigger one', () => {
    // "Sunol" alone should not claim the article about a different Sunol feature
    // unless the distinctive words genuinely overlap.
    expect(titlesAgree('Milpitas', 'Milpitas Grammar School')).toBe(true) // subset: all of it appears
    expect(titlesAgree('Milpitas Grammar School', 'Milpitas')).toBe(false) // most words missing
  })

  it('handles empty and punctuation-only names without matching', () => {
    expect(titlesAgree('', 'Mission Peak')).toBe(false)
    expect(titlesAgree('Mission Peak', '')).toBe(false)
    expect(titlesAgree('---', '&&&')).toBe(false)
  })
})

describe('haversineKm', () => {
  it('is zero for the same point', () => {
    expect(haversineKm(37.4323, -121.8996, 37.4323, -121.8996)).toBeCloseTo(0, 6)
  })

  it('measures the observed good matches as close', () => {
    // Great America: article coords vs OSM centroid, measured at 0.04km.
    expect(haversineKm(37.3963, -121.9722, 37.3966, -121.9724)).toBeLessThan(0.1)
  })

  it('is symmetric', () => {
    const a = haversineKm(37.43, -121.9, 37.51, -121.88)
    const b = haversineKm(37.51, -121.88, 37.43, -121.9)
    expect(a).toBeCloseTo(b, 9)
  })

  it('puts a genuinely distant landmark outside the accept threshold', () => {
    // Milpitas to San Francisco is far beyond any legitimate centroid offset.
    expect(haversineKm(37.4323, -121.8996, 37.7749, -122.4194)).toBeGreaterThan(MAX_DISTANCE_KM)
  })

  it('keeps a large park’s centroid-vs-entrance offset inside the threshold', () => {
    // Sunol Regional Wilderness matched at 1.9km — the widest real match seen.
    expect(haversineKm(37.5157, -121.8318, 37.5, -121.82)).toBeLessThan(MAX_DISTANCE_KM)
  })
})

describe('isSettlementMismatch', () => {
  it('rejects the town article that was illustrating a park', () => {
    // Both real: the photo was an aerial view of the whole town.
    expect(isSettlementMismatch('Calabasas Open Space', 'Calabasas, California')).toBe(true)
    expect(isSettlementMismatch('Bell Canyon Park', 'Bell Canyon, California')).toBe(true)
  })

  it('still allows a town to match its own article', () => {
    expect(isSettlementMismatch('Milpitas, California', 'Milpitas, California')).toBe(false)
  })

  it('leaves ordinary place articles alone', () => {
    expect(isSettlementMismatch('Mission Peak', 'Mission Peak')).toBe(false)
    expect(isSettlementMismatch('Año Nuevo State Park', 'Año Nuevo State Park')).toBe(false)
    // A disambiguator is not a settlement suffix.
    expect(isSettlementMismatch('Anderson Lake County Park', 'Anderson Lake (California)')).toBe(
      false,
    )
  })
})

describe('isNonPhoto', () => {
  it('rejects the locator map that was served as a park photo', () => {
    expect(
      isNonPhoto(
        'File:Ventura_County_California_Incorporated_and_Unincorporated_areas_Bell_Canyon_Highlighted_0604938.svg',
      ),
    ).toBe(true)
  })

  it('rejects civic graphics rather than photographs', () => {
    expect(isNonPhoto('File:Flag_of_California.svg')).toBe(true)
    expect(isNonPhoto('File:Coat_of_arms_of_Somewhere.png')).toBe(true)
    expect(isNonPhoto('File:Map_of_the_reserve.jpg')).toBe(true)
  })

  it('accepts real photographs', () => {
    expect(isNonPhoto('File:Blue_Oak_Ranch_(19071834426).jpg')).toBe(false)
    expect(isNonPhoto('File:Ano_Nuevo_seals.jpg')).toBe(false)
    expect(isNonPhoto(null)).toBe(false)
  })
})

describe('fileKey', () => {
  it('bridges the underscore/space mismatch that silently dropped attribution', () => {
    // Wikipedia says underscores, Commons answers with spaces. Unequal as given.
    expect(fileKey('File:Blue_Oak_Ranch_(19071834426).jpg')).toBe(
      fileKey('File:Blue Oak Ranch (19071834426).jpg'),
    )
  })
})

describe('titlesAgree with disambiguated article titles', () => {
  it('ignores the parenthetical when scoring', () => {
    // Real weak match: "Recreation" plus a shared "California" was enough before.
    expect(titlesAgree('California Recreation Center', 'Recreation Park (Long Beach, California)')).toBe(
      false,
    )
  })

  it('still matches the place the disambiguated article is about', () => {
    expect(titlesAgree('Castle Rock State Park', 'Castle Rock State Park (California)')).toBe(true)
    expect(titlesAgree('Anderson Lake County Park', 'Anderson Lake (California)')).toBe(true)
  })
})
