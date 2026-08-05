export type SceneVariant = 'sun' | 'bloom' | 'lagoon'

/** Category hue → artwork palette, so a grid reads as varied but stays in family. */
export function sceneVariantFor(hue: string): SceneVariant {
  if (hue === 'bloom') return 'bloom'
  if (hue === 'lagoon') return 'lagoon'
  return 'sun'
}

/**
 * Turns an id like "way/12345" into a stable small integer for the generated
 * artwork, so a place keeps the same scene across reloads and devices.
 */
export function seedFor(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) % 100_000
  }
  return hash
}
