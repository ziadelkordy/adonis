import { useMemo } from 'react'
import { seededRandom } from '@/lib/format'
import type { SceneVariant } from '@/lib/scene'

const PALETTES: Record<
  SceneVariant,
  { skyTop: string; skyBottom: string; sun: string; sunGlow: string; sea: string; seaDeep: string }
> = {
  // Sky tops are deliberately saturated: a pale sky leaves the sun disc invisible.
  sun: {
    skyTop: '#FFD95E',
    skyBottom: '#FFB3CC',
    sun: '#FFF6CE',
    sunGlow: '#FFA800',
    sea: '#FB6C9C',
    seaDeep: '#E14C81',
  },
  bloom: {
    skyTop: '#FFDCA0',
    skyBottom: '#FF8FB4',
    sun: '#FFF2DC',
    sunGlow: '#FF6E9E',
    sea: '#E14C81',
    seaDeep: '#B83566',
  },
  lagoon: {
    skyTop: '#FFDF7A',
    skyBottom: '#A8E8DC',
    sun: '#FFFAE0',
    sunGlow: '#FFB800',
    sea: '#6FDCC9',
    seaDeep: '#16A48F',
  },
}

interface Blossom {
  x: number
  y: number
  r: number
  rotation: number
  opacity: number
}

interface SceneProps {
  seed: number
  variant?: SceneVariant
  className?: string
}

/**
 * Procedural sunset artwork. Deterministic from `seed`, so a given activity always
 * gets the same picture — and there are no image requests to fail or slow us down.
 */
export function Scene({ seed, variant = 'sun', className }: SceneProps) {
  const palette = PALETTES[variant]
  const id = `scene-${variant}-${seed}`

  const { sunX, sunY, sunR, horizon, blossoms, waves } = useMemo(() => {
    const rand = seededRandom(seed)
    const sx = 60 + rand() * 280
    // Kept in the top quarter: cards anchor their text to the bottom, and a
    // low sun puts a bright disc directly behind the eyebrow and title.
    const sy = 30 + rand() * 40
    const sr = 20 + rand() * 13
    const h = 138 + rand() * 26

    const petals: Blossom[] = Array.from({ length: 5 + Math.floor(rand() * 4) }, () => ({
      x: rand() * 400,
      y: 12 + rand() * 110,
      r: 6 + rand() * 10,
      rotation: rand() * 90,
      opacity: 0.5 + rand() * 0.45,
    }))

    const w = Array.from({ length: 3 }, (_, i) => ({
      y: h + 16 + i * 22 + rand() * 8,
      amp: 5 + rand() * 7,
      opacity: 0.5 - i * 0.12,
    }))

    return { sunX: sx, sunY: sy, sunR: sr, horizon: h, blossoms: petals, waves: w }
  }, [seed])

  return (
    <svg
      viewBox="0 0 400 240"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0.2" y2="1">
          <stop offset="0%" stopColor={palette.skyTop} />
          <stop offset="100%" stopColor={palette.skyBottom} />
        </linearGradient>

        <radialGradient id={`${id}-glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={palette.sunGlow} stopOpacity="0.7" />
          <stop offset="55%" stopColor={palette.sunGlow} stopOpacity="0.2" />
          <stop offset="100%" stopColor={palette.sunGlow} stopOpacity="0" />
        </radialGradient>

        {/* Disc shades from white core to a warm rim so it reads on a yellow sky */}
        <radialGradient id={`${id}-disc`} cx="42%" cy="38%" r="70%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="55%" stopColor={palette.sun} />
          <stop offset="100%" stopColor={palette.sunGlow} />
        </radialGradient>

        <linearGradient id={`${id}-sea`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.sea} />
          <stop offset="100%" stopColor={palette.seaDeep} />
        </linearGradient>

        <clipPath id={`${id}-clip-sea`}>
          <rect x="0" y={horizon} width="400" height={240 - horizon} />
        </clipPath>
      </defs>

      <rect width="400" height="240" fill={`url(#${id}-sky)`} />

      {/* Sun: a wide soft glow with a crisp disc inside it */}
      <circle cx={sunX} cy={sunY} r={sunR * 2.6} fill={`url(#${id}-glow)`} />
      <circle cx={sunX} cy={sunY} r={sunR} fill={`url(#${id}-disc)`} />
      <circle
        cx={sunX}
        cy={sunY}
        r={sunR}
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity="0.55"
        strokeWidth="1.5"
      />

      {/* Blossoms drifting across the sky */}
      {blossoms.map((b, i) => (
        <g
          key={i}
          transform={`translate(${b.x} ${b.y}) rotate(${b.rotation})`}
          opacity={b.opacity}
          fill={i % 3 === 0 ? '#FFFFFF' : '#FFD1E2'}
        >
          {[0, 72, 144, 216, 288].map((angle) => (
            <ellipse
              key={angle}
              cx={0}
              cy={-b.r * 0.62}
              rx={b.r * 0.4}
              ry={b.r * 0.62}
              transform={`rotate(${angle})`}
            />
          ))}
          <circle r={b.r * 0.26} fill="#FFC820" />
        </g>
      ))}

      {/* Sea */}
      <rect
        x="0"
        y={horizon}
        width="400"
        height={240 - horizon}
        fill={`url(#${id}-sea)`}
      />

      {/* Horizon highlight — separates sky from sea without a hard seam */}
      <rect x="0" y={horizon - 1} width="400" height="2" fill="#FFFFFF" opacity="0.5" />

      {/* Sun reflection on the water */}
      <g clipPath={`url(#${id}-clip-sea)`}>
        <ellipse cx={sunX} cy={horizon + 30} rx={sunR * 1.5} ry={44} fill={palette.sun} opacity="0.3" />
        {waves.map((wave, i) => (
          <path
            key={i}
            d={`M -20 ${wave.y} Q 80 ${wave.y - wave.amp} 180 ${wave.y} T 420 ${wave.y}`}
            fill="none"
            stroke="#FFFFFF"
            strokeOpacity={wave.opacity}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        ))}
      </g>
    </svg>
  )
}

