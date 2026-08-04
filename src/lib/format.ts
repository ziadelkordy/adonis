/** Minutes-from-midnight → "6:30am" */
export function formatTime(totalMinutes: number): string {
  const minutes = ((totalMinutes % 1440) + 1440) % 1440
  const hour24 = Math.floor(minutes / 60)
  const minute = minutes % 60
  const suffix = hour24 < 12 ? 'am' : 'pm'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return minute === 0 ? `${hour12}${suffix}` : `${hour12}:${String(minute).padStart(2, '0')}${suffix}`
}

/** 105 → "1h 45m" */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours === 0) return `${mins}m`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
}

export function formatPrice(amount: number): string {
  if (amount === 0) return 'Free'
  return `$${amount.toLocaleString('en-US')}`
}

export function formatDistance(km: number): string {
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`
}

/** Deterministic 0–1 generator so generated artwork is stable across renders. */
export function seededRandom(seed: number): () => number {
  let state = seed * 1103515245 + 12345
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    return state / 0x7fffffff
  }
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural
}
