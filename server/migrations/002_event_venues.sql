/*
 * Geocoded event venues.
 *
 * Sports schedules give a venue name and city but no coordinates, and Nominatim
 * caps callers at one request per second — so each venue is geocoded once and reused
 * forever. `not_found` is recorded too, so a venue that cannot be geocoded isn't
 * retried on every single request.
 */
CREATE TABLE IF NOT EXISTS event_venues (
  -- lower(name)|lower(city) — stable and case-insensitive.
  cache_key   text PRIMARY KEY,
  name        text NOT NULL,
  city        text,
  region      text,
  lat         double precision,
  lon         double precision,
  not_found   boolean NOT NULL DEFAULT false,
  geocoded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_venues_not_found_idx ON event_venues (not_found);
