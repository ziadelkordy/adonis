# Sundial

Plan your day, find things to do, and dream up your next escape. Sunny, beachy,
flowery — yellow leads, pink accents, sea green keeps it from going saccharine.

A **front-end demo**: everything you see is generated locally. There is no
server and no accounts, and every place, price and rating is invented. Your day
and your saved items persist in `localStorage`.

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
    storage.ts      localStorage load/save with validation
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

## Persistence

Your day and your saved items are written to `localStorage` under
`sundial:state:v1` on every change, and read back once per mount before first
paint so there is no starter-day flicker. `src/lib/storage.ts` owns this, and it
is deliberately paranoid about what it reads back:

- Every access is wrapped in `try/catch` — Safari in private mode *throws* on
  `localStorage` rather than returning null, and quota errors are possible on
  write. If storage is unavailable the app just runs in memory.
- A corrupt or wrongly-shaped payload is treated as a first visit rather than
  crashing the app.
- Individual entries are validated and dropped: an activity that no longer
  exists in the catalogue, a start time outside the day, a duplicate id, a
  non-string saved id. A partially-valid day is restored rather than discarded.
- `loadState` returns `null` **only** when there is nothing usable stored. That
  is what distinguishes a first visit (seed `STARTER_DAY`) from a day the user
  deliberately cleared (an empty day that must stay empty across refreshes).
- Placement ids (`p-1004`) resume above the highest restored one, so an add
  after a refresh cannot reuse an id and duplicate a React key.

Because clearing the day is now permanent, the Today empty state offers
**Restore the example day** as the way back to the seeded content.

Bump `STORAGE_KEY` if the persisted shape changes; old payloads are then ignored
rather than mis-parsed.

## Notes for future work

- **No `AnimatePresence`.** Exit animations do not resolve in this
  motion 12 / React 19 pairing — removed items stayed in the DOM after their
  state was gone, and views wedged on the outgoing section. Enter animations and
  `layout` work fine, so those are used throughout and exits are simply instant.
  Worth revisiting on a motion upgrade.
- Reduced-motion is honoured globally via a `prefers-reduced-motion` block in
  `index.css`.

## Stack

React 19 · TypeScript · Vite 8 · Tailwind CSS v4 · motion · oxlint
