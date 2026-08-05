/*
 * Lets an event be scheduled, not just a place.
 *
 * `scheduled_items` could previously only reference `places`, so a match or a gig
 * found in Explore had nowhere to go. Events live behind live providers, so a
 * snapshot is stored here — otherwise a saved plan would break as soon as the
 * provider stopped listing it.
 */

CREATE TABLE IF NOT EXISTS events (
  -- Provider-scoped id, e.g. "espn:football/nfl/401..." or a Ticketmaster id.
  id            text PRIMARY KEY,
  source        text NOT NULL,
  name          text NOT NULL,
  starts_on     date NOT NULL,
  -- Minutes from midnight; null when the listing announces no time.
  starts_at_min integer CHECK (starts_at_min IS NULL OR (starts_at_min >= 0 AND starts_at_min < 1440)),
  venue_name    text,
  city          text,
  lat           double precision,
  lon           double precision,
  segment       text,
  genre         text,
  price_min     numeric(10, 2),
  price_max     numeric(10, 2),
  currency      text,
  image_url     text,
  url           text NOT NULL,
  /** Estimated, as with places — a listing states a start, never an end. */
  duration_min  integer NOT NULL DEFAULT 150,
  cached_at     timestamptz NOT NULL DEFAULT now()
);

-- place_id becomes optional so a row can point at an event instead.
ALTER TABLE scheduled_items ALTER COLUMN place_id DROP NOT NULL;

ALTER TABLE scheduled_items
  ADD COLUMN IF NOT EXISTS event_id text REFERENCES events (id) ON DELETE CASCADE;

-- Exactly one target, never both and never neither.
ALTER TABLE scheduled_items DROP CONSTRAINT IF EXISTS scheduled_items_one_target;
ALTER TABLE scheduled_items
  ADD CONSTRAINT scheduled_items_one_target
  CHECK ((place_id IS NOT NULL) <> (event_id IS NOT NULL));

/*
 * The existing unique constraint covers place rows only: with place_id null, every
 * event row counts as distinct under SQL's NULL semantics, so events need their
 * own partial unique index to get the same no-exact-duplicate guarantee.
 */
CREATE UNIQUE INDEX IF NOT EXISTS scheduled_items_event_unique
  ON scheduled_items (user_id, day, event_id, start_min)
  WHERE event_id IS NOT NULL;
