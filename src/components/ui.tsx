import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from '@/lib/cx'
import { HeartIcon, StarIcon } from './icons'

/* -------------------------------------------------------------------------- */
/* Button                                                                      */
/* -------------------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'bloom'
type ButtonSize = 'sm' | 'md' | 'lg'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  // Dark ink on sun yellow — the only combination here that clears AA on yellow
  primary:
    'bg-sun-400 text-ink-900 shadow-low hover:bg-sun-300 hover:shadow-glow-sun active:bg-sun-500',
  bloom:
    'bg-bloom-500 text-white shadow-low hover:bg-bloom-400 hover:shadow-glow-bloom active:bg-bloom-600',
  secondary:
    'bg-shell text-ink-900 ring-1 ring-ink-200 ring-inset shadow-low hover:bg-sun-50 hover:ring-sun-300',
  ghost: 'text-ink-700 hover:bg-sun-100 hover:text-ink-900',
}

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-3 text-[0.8125rem]',
  md: 'h-10 gap-2 px-4 text-sm',
  lg: 'h-12 gap-2 px-6 text-base',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full font-medium whitespace-nowrap',
        'transition-all duration-200 ease-out',
        'disabled:pointer-events-none disabled:opacity-45',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    />
  )
}

/* -------------------------------------------------------------------------- */
/* Chip — the one filter-toggle treatment used everywhere                      */
/* -------------------------------------------------------------------------- */

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean
  children: ReactNode
}

export function Chip({ selected, className, children, ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cx(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium',
        'transition-all duration-200 ease-out',
        selected
          ? 'bg-ink-900 text-sun-200 shadow-mid'
          : 'bg-shell text-ink-700 ring-1 ring-ink-200 ring-inset hover:bg-sun-50 hover:text-ink-900 hover:ring-sun-300',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* Badge — static labels, never interactive                                    */
/* -------------------------------------------------------------------------- */

type BadgeTone = 'sun' | 'bloom' | 'lagoon' | 'neutral' | 'glass'

const BADGE_TONES: Record<BadgeTone, string> = {
  sun: 'bg-sun-100 text-sun-700',
  bloom: 'bg-bloom-100 text-bloom-700',
  lagoon: 'bg-lagoon-100 text-lagoon-600',
  neutral: 'bg-ink-100 text-ink-700',
  glass: 'glass text-ink-900 ring-1 ring-white/60 ring-inset',
}

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: BadgeTone
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Rating                                                                      */
/* -------------------------------------------------------------------------- */

export function Rating({
  value,
  count,
  className,
}: {
  value: number
  count?: number
  className?: string
}) {
  return (
    <span className={cx('inline-flex items-center gap-1 text-xs text-ink-700', className)}>
      <StarIcon filled className="size-3.5 text-sun-500" />
      <span className="font-semibold text-ink-900">{value.toFixed(1)}</span>
      {count !== undefined && (
        <span className="text-ink-500">
          ({count > 999 ? `${(count / 1000).toFixed(1)}k` : count})
        </span>
      )}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Save (heart) toggle                                                         */
/* -------------------------------------------------------------------------- */

export function SaveButton({
  saved,
  onToggle,
  label,
  className,
}: {
  saved: boolean
  onToggle: () => void
  label: string
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${label} from saved` : `Save ${label}`}
      className={cx(
        'grid size-9 place-items-center rounded-full transition-all duration-200 ease-out',
        'glass ring-1 ring-white/70 ring-inset hover:scale-110 active:scale-95',
        saved ? 'text-bloom-500' : 'text-ink-700 hover:text-bloom-500',
        className,
      )}
    >
      <HeartIcon filled={saved} className="size-[18px]" />
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* Section header                                                              */
/* -------------------------------------------------------------------------- */

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        {eyebrow && (
          <p className="mb-1.5 text-xs font-semibold tracking-[0.16em] text-bloom-500 uppercase">
            {eyebrow}
          </p>
        )}
        <h2 className="text-2xl font-semibold text-ink-900 sm:text-3xl">{title}</h2>
        {description && <p className="mt-2 text-sm text-ink-700 sm:text-[0.9375rem]">{description}</p>}
      </div>
      {action}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Empty state                                                                 */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  emoji,
  title,
  description,
  action,
}: {
  emoji: string
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="grid place-items-center rounded-shell border border-dashed border-ink-300 bg-sand/60 px-6 py-16 text-center">
      <div className="grid size-16 place-items-center rounded-full bg-sun-100 text-3xl" aria-hidden>
        {emoji}
      </div>
      <h3 className="mt-4 text-lg font-semibold text-ink-900">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-ink-700">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
