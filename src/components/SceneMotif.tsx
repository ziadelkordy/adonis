import type { Category } from '@/lib/types'

/*
 * A silhouette of what the place actually is, standing on the horizon of the
 * generated scene.
 *
 * The scene alone is the same beach sunset for every place, so a Polish
 * restaurant and a redwood preserve were drawn identically — pretty, and
 * completely uninformative. Only a small share of places will ever have a real
 * photograph (see server/src/photos.ts), so the fallback carries most of the
 * grid and has to say something about the place rather than just fill the space.
 *
 * Silhouettes rather than illustrations: they read at card size, they never clash
 * with the sunset behind them since they take its colours, and they cost nothing
 * to draw. Everything is authored on a 400x240 canvas standing on y=0, and the
 * caller translates the group down to wherever that scene's horizon fell.
 */

interface MotifProps {
  category: Category
  /** Deep tone of the current palette, so the silhouette belongs to the scene. */
  color: string
}

/** Drawn standing on y=0, facing right, roughly 120 units wide. */
const MOTIFS: Record<Category, React.ReactNode> = {
  /*
   * A cup and saucer with steam. This is by far the most common category — most
   * of any grid is food — so it is the one motif that has to be unmistakable.
   * An earlier attempt drew a bistro table and parasol, which at card size
   * dissolved into unreadable sticks.
   */
  food: (
    <>
      {/* Steam */}
      <path
        d="M-8 -52 q-7 -8 0 -16 q7 -8 0 -16"
        fill="none"
        strokeWidth="3.5"
        strokeLinecap="round"
        stroke="currentColor"
        opacity="0.75"
      />
      <path
        d="M8 -52 q-7 -8 0 -16 q7 -8 0 -16"
        fill="none"
        strokeWidth="3.5"
        strokeLinecap="round"
        stroke="currentColor"
        opacity="0.55"
      />
      {/* Handle, drawn before the body so the body laps over its join */}
      <path
        d="M22 -38 a12 12 0 0 1 0 20"
        fill="none"
        strokeWidth="6"
        strokeLinecap="round"
        stroke="currentColor"
      />
      {/* Cup */}
      <path d="M-24 -44 h48 l-6 34 a8 8 0 0 1 -8 6 h-20 a8 8 0 0 1 -8 -6 z" />
      {/* Saucer */}
      <ellipse cx="0" cy="-2" rx="38" ry="7" />
    </>
  ),

  // Layered hills with conifers.
  outdoors: (
    <>
      <path d="M-70 0 q30 -34 62 -6 q22 -20 46 6 z" opacity="0.55" />
      <path d="M-10 0 l14 -40 l14 40 z" />
      <path d="M-6 0 l10 -26 l10 26 z" opacity="0.8" />
      <path d="M30 0 l11 -32 l11 32 z" />
      <path d="M-44 0 l9 -24 l9 24 z" />
    </>
  ),

  // A sailboat.
  water: (
    <>
      <path d="M0 -46 l24 40 h-24 z" />
      <path d="M-4 -40 l-18 34 h18 z" opacity="0.85" />
      <path d="M-34 -4 h74 l-12 10 h-50 z" />
    </>
  ),

  // A pavilion with columns — museum, gallery, library.
  culture: (
    <>
      <path d="M-42 -30 l42 -18 l42 18 z" />
      <rect x="-40" y="-30" width="80" height="5" />
      {[-32, -16, 0, 16, 28].map((x) => (
        <rect key={x} x={x} y="-25" width="7" height="25" />
      ))}
      <rect x="-44" y="-4" width="88" height="4" rx="1" />
    </>
  ),

  // A ferris wheel.
  fun: (
    <>
      <circle cx="0" cy="-40" r="26" fill="none" strokeWidth="4" stroke="currentColor" />
      <circle cx="0" cy="-40" r="5" />
      {[0, 45, 90, 135].map((angle) => (
        <line
          key={angle}
          x1={-26 * Math.cos((angle * Math.PI) / 180)}
          y1={-40 - 26 * Math.sin((angle * Math.PI) / 180)}
          x2={26 * Math.cos((angle * Math.PI) / 180)}
          y2={-40 + 26 * Math.sin((angle * Math.PI) / 180)}
          strokeWidth="3"
          stroke="currentColor"
        />
      ))}
      <path d="M-14 0 l14 -22 l14 22 z" opacity="0.9" />
    </>
  ),

  // A skyline with a moon — the after-dark signal.
  nightlife: (
    <>
      <circle cx="34" cy="-52" r="11" opacity="0.9" />
      <rect x="-46" y="-34" width="18" height="34" />
      <rect x="-24" y="-48" width="16" height="48" />
      <rect x="-4" y="-28" width="20" height="28" />
      <rect x="20" y="-38" width="14" height="38" />
    </>
  ),

  // An easel.
  creative: (
    <>
      <path d="M-24 0 l18 -46 h12 l18 46 h-8 l-16 -40 l-16 40 z" />
      <rect x="-22" y="-40" width="44" height="30" rx="2" opacity="0.9" />
      <rect x="-26" y="-14" width="52" height="4" rx="2" />
    </>
  ),

  // A market stall with a scalloped awning.
  market: (
    <>
      <path d="M-44 -30 h88 l-8 -14 h-72 z" />
      <path d="M-44 -30 q11 10 22 0 q11 10 22 0 q11 10 22 0 q11 10 22 0 z" opacity="0.85" />
      <rect x="-40" y="-30" width="4" height="30" />
      <rect x="36" y="-30" width="4" height="30" />
      <rect x="-30" y="-12" width="60" height="12" rx="2" opacity="0.75" />
    </>
  ),

  // A blossom on a stem.
  wellness: (
    <>
      <rect x="-2" y="-34" width="4" height="34" rx="2" />
      <path d="M-18 -30 q14 -6 16 -14 q2 8 16 14 q-14 6 -16 14 q-2 -8 -16 -14 z" />
      <ellipse cx="-16" cy="-14" rx="12" ry="6" transform="rotate(-18 -16 -14)" opacity="0.8" />
      <ellipse cx="16" cy="-10" rx="12" ry="6" transform="rotate(18 16 -10)" opacity="0.8" />
    </>
  ),
}

/**
 * The silhouette for a category, ready to be placed on a scene's horizon.
 *
 * Rendered in the palette's deep tone at partial opacity so it sits in the
 * picture rather than on top of it, and marked decorative — the card already
 * states the category in text next to it.
 */
export function SceneMotif({ category, color }: MotifProps) {
  return (
    <g fill={color} color={color} opacity="0.5" aria-hidden="true">
      {MOTIFS[category]}
    </g>
  )
}
