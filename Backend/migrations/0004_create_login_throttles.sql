-- FlowBoard per-account sign-in backoff (chunk 7.4).
--
-- The per-address rate limit cannot stop someone guessing one account's
-- password from many addresses. This counts consecutive failed sign-ins per
-- *submitted email address*, and past a threshold makes the next attempt
-- wait, doubling each time up to a cap.
--
-- Keyed on the address as typed and normalised, whether or not an account
-- exists. Throttling only real accounts would make the throttle itself
-- answer "is this address registered?" (AUTH_DECISIONS.md E-12).

CREATE TABLE login_throttles (
  -- SHA-256 (hex) of the normalised address. Never the address itself.
  account_key      text        PRIMARY KEY,

  -- Consecutive failures since the last success, or since the count decayed.
  failures         integer     NOT NULL,

  last_failure_at  timestamptz NOT NULL,

  -- No attempt is even checked before this. Null below the threshold.
  blocked_until    timestamptz,

  CONSTRAINT login_throttles_account_key_check CHECK (account_key ~ '^[0-9a-f]{64}$'),
  CONSTRAINT login_throttles_failures_check CHECK (failures >= 1)
);

-- For the sweep of rows nobody has failed against in a long while.
CREATE INDEX login_throttles_last_failure_at_idx
  ON login_throttles (last_failure_at);
