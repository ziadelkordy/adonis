/*
 * The Adonis mark: a grey teddy bear on the app's sunrise gradient.
 *
 * Defined once and reused, so the header, any future splash and the favicon can't
 * drift apart. The bear is deliberately grey against a warm background — a neutral
 * grey would read as dead next to this palette, so the fur greys lean warm (see
 * --color-bear-* in index.css).
 *
 * Colours are passed as literals rather than CSS variables because this same
 * geometry is mirrored in public/favicon.svg, which has no access to the theme.
 */

interface BearMarkProps {
  className?: string
  /** Draws the gradient disc behind the bear. Off for a bare silhouette. */
  withBackground?: boolean
  /** Rendered inside a <title> for assistive technology. */
  title?: string
}

export function BearMark({ className, withBackground = true, title }: BearMarkProps) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title && <title>{title}</title>}

      <defs>
        <linearGradient id="bear-sun" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFD84D" />
          <stop offset="55%" stopColor="#FFC820" />
          <stop offset="100%" stopColor="#FB6C9C" />
        </linearGradient>
        <linearGradient id="bear-fur" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#A8A29C" />
          <stop offset="100%" stopColor="#7A746E" />
        </linearGradient>
      </defs>

      {withBackground && <circle cx="20" cy="20" r="20" fill="url(#bear-sun)" />}

      {/* Ears first, so the head overlaps their lower edge and they read as behind it */}
      <g fill="url(#bear-fur)">
        <circle cx="10.5" cy="12" r="5.4" />
        <circle cx="29.5" cy="12" r="5.4" />
      </g>
      <g fill="#ECEAE7">
        <circle cx="10.5" cy="12" r="2.6" />
        <circle cx="29.5" cy="12" r="2.6" />
      </g>

      {/* Head */}
      <circle cx="20" cy="22" r="11.2" fill="url(#bear-fur)" />

      {/* Muzzle */}
      <ellipse cx="20" cy="25.6" rx="6.2" ry="5" fill="#ECEAE7" />

      {/* Eyes, set just above the muzzle */}
      <g fill="#3A3633">
        <circle cx="15.4" cy="19.4" r="1.55" />
        <circle cx="24.6" cy="19.4" r="1.55" />
      </g>

      {/* Nose and mouth */}
      <ellipse cx="20" cy="23.4" rx="2.1" ry="1.5" fill="#3A3633" />
      <path
        d="M20 24.9v1.5M20 26.4c-.9 0-1.7-.5-2-1.2M20 26.4c.9 0 1.7-.5 2-1.2"
        stroke="#3A3633"
        strokeWidth="1"
        strokeLinecap="round"
        fill="none"
      />

      {/* A single highlight, so the grey doesn't read as flat */}
      <circle cx="15.8" cy="18.8" r="0.5" fill="#FFFFFF" opacity="0.9" />
      <circle cx="25" cy="18.8" r="0.5" fill="#FFFFFF" opacity="0.9" />
    </svg>
  )
}
