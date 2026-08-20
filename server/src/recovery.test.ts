import { describe, expect, it } from 'vitest'
import { hashCode, normalizeCode } from './recovery.ts'

describe('normalizeCode', () => {
  it('accepts a code however it was typed', () => {
    // The three ways a real person will enter it: pasted, typed bare, lowercased.
    const canonical = normalizeCode('ABCD-2345-EFGH-6789')
    expect(normalizeCode('abcd234 5efgh6789')).toBe(canonical)
    expect(normalizeCode('ABCD2345EFGH6789')).toBe(canonical)
    expect(normalizeCode('  abcd-2345-efgh-6789  ')).toBe(canonical)
  })

  it('strips every kind of separator someone might introduce', () => {
    expect(normalizeCode('ABCD_2345.EFGH 6789')).toBe('ABCD2345EFGH6789')
  })

  it('leaves an empty input empty rather than inventing a code', () => {
    expect(normalizeCode('')).toBe('')
    expect(normalizeCode('----')).toBe('')
  })
})

describe('hashCode', () => {
  it('is stable across formatting differences', () => {
    // The whole point: a code written down with dashes must match one typed without.
    expect(hashCode('abcd-2345-efgh-6789')).toBe(hashCode('ABCD2345EFGH6789'))
  })

  it('differs for different codes', () => {
    expect(hashCode('ABCD-2345-EFGH-6789')).not.toBe(hashCode('ABCD-2345-EFGH-678Z'))
  })

  it('never returns the code itself', () => {
    const code = 'ABCD-2345-EFGH-6789'
    const hashed = hashCode(code)
    expect(hashed).not.toContain('ABCD')
    expect(hashed).toMatch(/^[0-9a-f]{64}$/)
  })
})
