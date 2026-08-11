import { describe, expect, it } from 'vitest'
import { describeCode } from './weather.ts'

describe('describeCode', () => {
  it('names the conditions that change a plan', () => {
    expect(describeCode(0).label).toBe('Clear')
    expect(describeCode(3).label).toBe('Overcast')
    expect(describeCode(65).label).toBe('Rain')
    expect(describeCode(95).label).toBe('Thunderstorms')
  })

  it('separates rain from thunderstorms', () => {
    // Grouping these together would hide the one that cancels an outdoor plan.
    expect(describeCode(61).label).not.toBe(describeCode(95).label)
  })

  it('groups intensities that do not change a plan', () => {
    // Slight, moderate and dense drizzle are the same decision.
    expect(describeCode(51).label).toBe(describeCode(55).label)
    expect(describeCode(61).label).toBe(describeCode(65).label)
  })

  it('gives every documented WMO code a real label', () => {
    const documented = [
      0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85,
      86, 95, 96, 99,
    ]
    for (const code of documented) {
      expect(describeCode(code).label, `code ${code}`).not.toBe('Unknown')
    }
  })

  it('admits when a code is unrecognised instead of inventing one', () => {
    expect(describeCode(-1).label).toBe('Unknown')
    expect(describeCode(1234).label).toBe('Unknown')
  })

  it('always supplies an emoji', () => {
    for (const code of [0, 3, 65, 95, -1]) {
      expect(describeCode(code).emoji.length).toBeGreaterThan(0)
    }
  })
})
