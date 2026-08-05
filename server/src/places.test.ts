import { describe, expect, it } from 'vitest'
import { boundingBox, haversineKm } from './places.ts'

describe('haversineKm', () => {
  it('is zero for the same point', () => {
    expect(haversineKm(34.0195, -118.4912, 34.0195, -118.4912)).toBe(0)
  })

  it('matches a known distance', () => {
    // Santa Monica to Dodger Stadium is about 24 km.
    const km = haversineKm(34.0195, -118.4912, 34.0739, -118.24)
    expect(km).toBeGreaterThan(22)
    expect(km).toBeLessThan(26)
  })

  it('is symmetric', () => {
    const there = haversineKm(51.5, -0.12, 48.85, 2.35)
    const back = haversineKm(48.85, 2.35, 51.5, -0.12)
    expect(there).toBeCloseTo(back, 9)
  })

  it('survives antipodal points without NaN from a rounding overshoot', () => {
    // The sqrt argument can exceed 1 by a rounding error; asin would return NaN.
    const km = haversineKm(0, 0, 0, 180)
    expect(Number.isFinite(km)).toBe(true)
    expect(km).toBeGreaterThan(20_000)
  })
})

describe('boundingBox', () => {
  it('encloses the requested radius', () => {
    const lat = 34.0195
    const lon = -118.4912
    const radiusM = 2000
    const box = boundingBox(lat, lon, radiusM)

    expect(box.south).toBeLessThan(lat)
    expect(box.north).toBeGreaterThan(lat)
    expect(box.west).toBeLessThan(lon)
    expect(box.east).toBeGreaterThan(lon)

    // The box must not cut inside the circle, or results would be lost.
    expect(haversineKm(lat, lon, box.north, lon) * 1000).toBeGreaterThanOrEqual(radiusM - 1)
    expect(haversineKm(lat, lon, lat, box.east) * 1000).toBeGreaterThanOrEqual(radiusM - 1)
  })

  it('widens longitude towards the poles', () => {
    const equator = boundingBox(0, 0, 10_000)
    const arctic = boundingBox(70, 0, 10_000)

    const equatorWidth = equator.east - equator.west
    const arcticWidth = arctic.east - arctic.west

    // A degree of longitude covers less ground further north, so the box in
    // degrees has to be wider to hold the same distance.
    expect(arcticWidth).toBeGreaterThan(equatorWidth * 2)
  })

  it('does not blow up at the pole', () => {
    // cos(90°) is 0; without a floor this divides by zero.
    const box = boundingBox(90, 0, 5000)
    expect(Number.isFinite(box.east)).toBe(true)
    expect(Number.isFinite(box.west)).toBe(true)
  })
})
