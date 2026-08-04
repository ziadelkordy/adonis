-- Sundial schema.
-- Safe to run repeatedly: every statement is guarded.

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  display_name  text NOT NULL,
  -- scrypt: "<salt-hex>:<derived-key-hex>". No plaintext ever stored.
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness so Foo@x.com and foo@x.com are the same account.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON users (lower(email));

CREATE TABLE IF NOT EXISTS sessions (
  -- The opaque token handed to the browser in an httpOnly cookie.
  token      text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);

/*
 * Places fetched from OpenStreetMap, cached here so that:
 *   1. a saved or scheduled item can still be rendered without re-querying OSM, and
 *   2. repeat browsing of the same area doesn't hammer a free public API.
 * id is the OSM identity, e.g. "way/12345" — stable across refetches.
 */
CREATE TABLE IF NOT EXISTS places (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  category      text NOT NULL,
  lat           double precision NOT NULL,
  lon           double precision NOT NULL,
  neighborhood  text,
  -- Raw OSM opening_hours string. Displayed as-is; deliberately not parsed.
  opening_hours text,
  website       text,
  phone         text,
  -- OSM `fee` tag: true = costs money, false = explicitly free, null = unknown.
  fee           boolean,
  cuisine       text,
  /** Minutes. A per-category default, since OSM carries no visit duration. */
  duration_min  integer NOT NULL,
  tags          jsonb NOT NULL DEFAULT '{}'::jsonb,
  fetched_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS places_category_idx ON places (category);

/*
 * Which OSM areas have been fetched already, so a repeat visit to the same
 * neighbourhood is served from `places` instead of hitting Overpass again.
 * The key is a coarse geohash-ish bucket plus the radius and category set.
 */
CREATE TABLE IF NOT EXISTS place_queries (
  cache_key   text PRIMARY KEY,
  place_ids   text[] NOT NULL,
  fetched_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saved_items (
  user_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- A place id ("way/123") or a curated destination id ("d-amalfi").
  item_id  text NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE IF NOT EXISTS scheduled_items (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  place_id  text NOT NULL REFERENCES places (id) ON DELETE CASCADE,
  -- The calendar day this sits on, so history is kept rather than overwritten.
  day       date NOT NULL,
  -- Minutes from midnight, 0..1439.
  start_min integer NOT NULL CHECK (start_min >= 0 AND start_min < 1440),
  CONSTRAINT scheduled_items_no_exact_duplicate UNIQUE (user_id, day, place_id, start_min)
);

CREATE INDEX IF NOT EXISTS scheduled_items_user_day_idx ON scheduled_items (user_id, day);
