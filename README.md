# Sundial

Plan your day, find things to do, and dream up your next escape. Sunny, beachy,
flowery — yellow leads, pink accents, sea green keeps it from going saccharine.

A **front-end demo**: everything you see is generated locally. There is no
server, no accounts, and every place, price and rating is invented.

## Run it

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

Other scripts:

```bash
pnpm build        # tsc -b && vite build
pnpm preview      # serve the production build
pnpm lint         # oxlint
```

## The four sections

| Section     | What it does |
|-------------|--------------|
| **Today**   | A real time-positioned timeline, 6am to midnight. Nudge activities ±30 min, drop them, and see gaps surfaced as "1h 15m free". Live "now" marker, running totals for time and spend. |
| **Explore** | 24 activities with filters for price tier, time of day, category, max distance, minimum rating and outdoors-only, plus six sort orders and free-text search. |
| **Escapes** | 10 destinations as editorial cards — nightly rate, flight length, best months, average temperature. Filter by budget and flight time. |
| **Saved**   | Everything hearted across Explore and Escapes, split into nearby and far away. |

Adding from Explore lands the activity in Today automatically: `findSlot` picks
the earliest opening inside the activity's own preferred time-of-day window,
leaving a 15-minute buffer either side so a generated day never reads as
back-to-back.

## Layout

```
src/
  lib/
    types.ts        Activity, Destination, ScheduledItem
    data.ts         The mock catalogue + category/price metadata
    useAppState.ts  Single state hook: day, saved, toasts, slot-finding
    format.ts       Time, duration, price, distance, seeded RNG
    cx.ts           className joiner
    scene.ts        Category hue -> artwork palette
  components/
    Scene.tsx       Procedural sunset artwork (see below)
    ui.tsx          Button, Chip, Badge, Rating, SaveButton, EmptyState
    icons.tsx       Inline SVG icon set
    Nav.tsx         Top tabs on desktop, bottom bar on mobile
    ActivityCard.tsx / DestinationCard.tsx
  views/
    Today.tsx  Explore.tsx  Escapes.tsx  Saved.tsx
```

### Design tokens

Every colour, radius and shadow lives in the `@theme` block at the top of
`src/index.css` — `sun-*`, `bloom-*`, `lagoon-*`, `ink-*` (warm brown-blacks
rather than grey), plus `bg-sunrise`, `text-sunrise`, `glass`,
`scrim-editorial` and `text-on-art` utilities. Nothing downstream hardcodes a
colour, so retuning the palette is a single-file change.

### Artwork is generated, not fetched

`Scene.tsx` draws each card's picture as an SVG from a per-item integer seed:
sun disc and glow, drifting five-petal blossoms, a horizon and sun reflection on
the water. Same seed always yields the same picture, and there are no image
requests to fail or slow the page down.

Because the art is procedural, no scrim tuning can guarantee contrast for every
seed — so light text over it also carries the `.text-on-art` shadow.

## Notes for future work

- **Nothing persists.** Refreshing resets your day and your hearts. `localStorage`
  in `useAppState` would be a small, self-contained next step.
- **No `AnimatePresence`.** Exit animations do not resolve in this
  motion 12 / React 19 pairing — removed items stayed in the DOM after their
  state was gone, and views wedged on the outgoing section. Enter animations and
  `layout` work fine, so those are used throughout and exits are simply instant.
  Worth revisiting on a motion upgrade.
- Reduced-motion is honoured globally via a `prefers-reduced-motion` block in
  `index.css`.

## Stack

React 19 · TypeScript · Vite 8 · Tailwind CSS v4 · motion · oxlint
