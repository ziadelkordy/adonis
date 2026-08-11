import { describe, expect, it } from 'vitest'
import { WeatherUnavailableError, describeCode, parseForecast } from './weather'

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

describe('parseForecast', () => {
  const payload = {
    timezone: 'America/Los_Angeles',
    daily: {
      time: ['2026-08-11', '2026-08-12'],
      weather_code: [3, 65],
      temperature_2m_max: [28.4, 14.1],
      temperature_2m_min: [14.1, 9.2],
      precipitation_probability_max: [0, 85],
      sunrise: ['2026-08-11T06:20', '2026-08-12T06:21'],
      sunset: ['2026-08-11T20:04', '2026-08-12T20:03'],
    },
    hourly: {
      time: ['2026-08-11T00:00', '2026-08-11T15:00', '2026-08-12T15:00'],
      temperature_2m: [15.4, 27.8, 13.0],
      precipitation_probability: [0, 10, 90],
      weather_code: [3, 3, 65],
    },
  }

  it('converts to Fahrenheit alongside Celsius', () => {
    const { days } = parseForecast(payload)
    expect(days[0].highC).toBe(28)
    expect(days[0].highF).toBe(82)
    expect(days[1].lowC).toBe(9)
    expect(days[1].lowF).toBe(48)
  })

  it('reduces the timestamp to a local clock time', () => {
    // Open-Meteo already returns local time, so no conversion — just trimming.
    expect(parseForecast(payload).days[0].sunset).toBe('20:04')
    expect(parseForecast(payload).days[0].sunrise).toBe('06:20')
  })

  it('groups hourly readings by their own date', () => {
    const { hours } = parseForecast(payload)
    expect(Object.keys(hours).sort()).toEqual(['2026-08-11', '2026-08-12'])
    expect(hours['2026-08-11'].map((h) => h.hour)).toEqual([0, 15])
    expect(hours['2026-08-12'][0].rainChance).toBe(90)
  })

  it('treats a missing precipitation probability as zero, not as a crash', () => {
    const sparse = {
      ...payload,
      daily: { ...payload.daily, precipitation_probability_max: [null, null] },
    }
    expect(parseForecast(sparse).days[0].rainChance).toBe(0)
  })

  it('refuses a payload with no days rather than returning an empty forecast', () => {
    expect(() => parseForecast({ daily: { time: [] } })).toThrow(WeatherUnavailableError)
    expect(() => parseForecast({})).toThrow(WeatherUnavailableError)
  })

  it('falls back to UTC when no timezone is given', () => {
    const { timezone } = parseForecast({ ...payload, timezone: undefined })
    expect(timezone).toBe('UTC')
  })
})
