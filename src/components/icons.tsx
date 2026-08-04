import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: 'false' as const,
}

export function SunIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
    </svg>
  )
}

export function CalendarIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.25" y="4.75" width="17.5" height="16" rx="3" />
      <path d="M3.25 9.5h17.5M8 2.75v3.5M16 2.75v3.5" />
    </svg>
  )
}

export function CompassIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9.25" />
      <path d="M15.4 8.6l-1.9 4.9-4.9 1.9 1.9-4.9z" />
    </svg>
  )
}

export function PalmIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 21.5c0-5.5.6-9.4 1.6-11.8" />
      <path d="M13.6 9.7C11.9 7.4 8.7 6.9 6.4 8.4M13.6 9.7c-.3-2.9 1.5-5.5 4.2-6.2M13.6 9.7c2.3-1.7 5.5-1.4 7.2.7M13.6 9.7C12.4 7 9.6 5.4 6.8 5.9" />
      <path d="M7 21.5c1.2-1.6 3-2.5 5-2.5s3.8.9 5 2.5" />
    </svg>
  )
}

export function HeartIcon({ filled, ...props }: IconProps & { filled?: boolean }) {
  return (
    <svg {...base} fill={filled ? 'currentColor' : 'none'} {...props}>
      <path d="M12 20.3l-1.3-1.2C6.1 15 3.25 12.4 3.25 9.2A4.7 4.7 0 018 4.5c1.6 0 3.1.75 4 1.95A5 5 0 0116 4.5a4.7 4.7 0 014.75 4.7c0 3.2-2.85 5.8-7.45 10z" />
    </svg>
  )
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 5.5v13M5.5 12h13" />
    </svg>
  )
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4.5 7h15M9.5 7V4.75h5V7M6.5 7l.8 12.3a1.5 1.5 0 001.5 1.45h6.4a1.5 1.5 0 001.5-1.45L17.5 7" />
    </svg>
  )
}

export function StarIcon({ filled, ...props }: IconProps & { filled?: boolean }) {
  return (
    <svg {...base} fill={filled ? 'currentColor' : 'none'} {...props}>
      <path d="M12 3.75l2.6 5.3 5.85.85-4.22 4.12 1 5.83L12 17.1l-5.23 2.75 1-5.83-4.22-4.12 5.85-.85z" />
    </svg>
  )
}

export function ClockIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9.25" />
      <path d="M12 7.25V12l3.25 2" />
    </svg>
  )
}

export function PinIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 21.5s7-5.4 7-11a7 7 0 10-14 0c0 5.6 7 11 7 11z" />
      <circle cx="12" cy="10.2" r="2.6" />
    </svg>
  )
}

export function SlidersIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 7.5h10M18 7.5h2M4 16.5h4M12 16.5h8" />
      <circle cx="16" cy="7.5" r="2.1" />
      <circle cx="10" cy="16.5" r="2.1" />
    </svg>
  )
}

export function XIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </svg>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 12.75l4.5 4.5 9.5-10" />
    </svg>
  )
}

export function PlaneIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 13.5l18-7.5-3.5 8.5L21 21l-6.5-3-4 2.5.5-4.5z" />
    </svg>
  )
}

export function ThermometerIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M14 14.2V5.5a2 2 0 10-4 0v8.7a4 4 0 104 0z" />
    </svg>
  )
}

export function SparkleIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.5l1.7 4.8 4.8 1.7-4.8 1.7L12 16.5l-1.7-4.8L5.5 10l4.8-1.7z" />
      <path d="M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
    </svg>
  )
}
