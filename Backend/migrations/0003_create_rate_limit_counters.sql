-- FlowBoard rate limits: one counter per bucket per window (chunk 7.2).
--
-- In PostgreSQL rather than in each process's memory, so a limit holds across
-- every instance and survives a restart (AUTH_DECISIONS.md E-17, ADR 0006).
-- An in-memory limit across N instances is N times the configured limit.
--
-- One row per bucket and window, incremented by a single atomic upsert, so
-- concurrent requests on any number of instances cannot overshoot.

CREATE TABLE rate_limit_counters (
  -- "<limit name>:<sha256 of the key>". The key is an address or, later, an
  -- account. It is hashed so this table never holds either in the clear.
  bucket        text        NOT NULL,

  -- The start of the fixed window this row counts, from the database clock,
  -- so every instance agrees on where a window begins.
  window_start  timestamptz NOT NULL,

  hits          integer     NOT NULL DEFAULT 0,

  -- When the row stops mattering. Swept by the limiter itself.
  expires_at    timestamptz NOT NULL,

  PRIMARY KEY (bucket, window_start),

  CONSTRAINT rate_limit_counters_hits_check CHECK (hits >= 0),
  CONSTRAINT rate_limit_counters_expiry_check CHECK (expires_at > window_start),
  CONSTRAINT rate_limit_counters_bucket_length_check CHECK (char_length(bucket) BETWEEN 1 AND 200)
);

-- For the sweep, which deletes by expiry and would otherwise scan everything.
CREATE INDEX rate_limit_counters_expires_at_idx
  ON rate_limit_counters (expires_at);
