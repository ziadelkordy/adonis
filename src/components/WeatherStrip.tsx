import type { DayWeather } from '@/lib/useForecast'

/*
 * The day's weather, above the timeline.
 *
 * Both temperature scales are shown rather than guessing which one you use, and
 * rain chance appears only when it is high enough to change a decision — a badge
 * reading "1%" is noise on every dry day, which is most of them.
 */

/** Below this, the chance isn't worth a line of its own. */
const RAIN_WORTH_MENTIONING = 25

export function WeatherStrip({ day }: { day: DayWeather }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-petal bg-shell/70 px-4 py-2.5 text-sm ring-1 ring-ink-200/60 ring-inset">
      <span className="flex items-center gap-2 font-semibold text-ink-900">
        <span aria-hidden className="text-base">
          {day.emoji}
        </span>
        {day.label}
      </span>

      <span className="text-ink-700">
        {day.highF}°F / {day.lowF}°F
        <span className="ml-1.5 text-ink-400 text-xs">
          ({day.highC}–{day.lowC}°C)
        </span>
      </span>

      {day.rainChance >= RAIN_WORTH_MENTIONING && (
        <span className="flex items-center gap-1 font-medium text-lagoon-600">
          <span aria-hidden>💧</span>
          {day.rainChance}% chance of rain
        </span>
      )}

      {day.sunset && (
        <span className="ml-auto text-ink-500 text-xs">
          {day.sunrise && <>Sunrise {day.sunrise} · </>}Sunset {day.sunset}
        </span>
      )}
    </div>
  )
}
