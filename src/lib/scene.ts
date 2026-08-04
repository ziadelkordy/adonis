export type SceneVariant = 'sun' | 'bloom' | 'lagoon'

/** Category hue → artwork palette, so a grid reads as varied but stays in family. */
export function sceneVariantFor(hue: string): SceneVariant {
  if (hue === 'bloom') return 'bloom'
  if (hue === 'lagoon') return 'lagoon'
  return 'sun'
}
