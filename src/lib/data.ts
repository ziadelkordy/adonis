import type { Category } from './types'

export const CATEGORY_META: Record<Category, { label: string; emoji: string; hue: string }> = {
  outdoors: { label: 'Outdoors', emoji: '🌿', hue: 'lagoon' },
  water: { label: 'On the water', emoji: '🌊', hue: 'lagoon' },
  food: { label: 'Food & drink', emoji: '🍋', hue: 'sun' },
  wellness: { label: 'Wellness', emoji: '🌸', hue: 'bloom' },
  culture: { label: 'Culture', emoji: '🖼️', hue: 'bloom' },
  nightlife: { label: 'Nightlife', emoji: '🌅', hue: 'bloom' },
  creative: { label: 'Creative', emoji: '🎨', hue: 'sun' },
  market: { label: 'Markets', emoji: '🧺', hue: 'sun' },
  fun: { label: 'Fun & games', emoji: '🎡', hue: 'bloom' },
}

/**
 * What the Fun tab shows. An editorial grouping over the categories rather than
 * a separate fetch, so switching tabs is instant and costs no extra requests.
 */
export const FUN_CATEGORIES: Category[] = ['fun', 'nightlife', 'creative', 'water']
