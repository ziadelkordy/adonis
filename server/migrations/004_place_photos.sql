/*
 * Real photographs for places, resolved from Wikipedia/Wikimedia.
 *
 * Deliberately NOT a foreign key onto `places`: escapes, events and any future
 * source can all be photographed, and a photo outliving its place row is
 * harmless where a failed insert would not be.
 *
 * `status` carries the negative cache. A place with no findable photo is stored
 * as 'none' rather than left absent, so a miss is remembered instead of being
 * re-resolved on every browse — most places have no photo, so the misses are the
 * common case and the one worth caching.
 */
CREATE TABLE IF NOT EXISTS place_photos (
  place_id      text PRIMARY KEY,
  -- 'ok' = url is set. 'none' = looked, found nothing verifiable.
  status        text NOT NULL CHECK (status IN ('ok', 'none')),
  url           text,
  width         integer,
  height        integer,
  -- Commons file, e.g. "File:Mission Peak.jpg" — the unit licensing applies to.
  file_title    text,
  -- The Wikipedia article the photo was taken from, for the "source" link.
  article_title text,
  article_url   text,
  /*
   * Attribution, required by the CC licences most Commons photos carry. Null
   * when Commons has no structured credit; the UI falls back to naming Wikimedia
   * Commons and linking the file, which the licences accept.
   */
  artist        text,
  license       text,
  /*
   * How far the article's own coordinates sit from the place, in km. Kept
   * because it is the evidence the match is real — a photo accepted at 0.04km is
   * a different claim from one accepted at 5km, and storing it means a later
   * tightening of the threshold can re-filter what is already cached rather than
   * re-resolving everything.
   */
  distance_km   double precision,
  resolved_at   timestamptz NOT NULL DEFAULT now()
);

/* Drives "which places still need resolving", the warm script's main query. */
CREATE INDEX IF NOT EXISTS place_photos_status_idx ON place_photos (status, resolved_at);
