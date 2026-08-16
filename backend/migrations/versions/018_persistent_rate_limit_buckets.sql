-- P0: shared persistent rate-limit buckets for multi-instance Cloud Run.
-- bucket_key is a SHA-256 digest; raw IP addresses and user identifiers are not stored.

CREATE TABLE rate_limit_buckets (
  bucket_key CHAR(64) PRIMARY KEY,
  request_count INTEGER NOT NULL DEFAULT 0,
  reset_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT rate_limit_buckets_key_format
    CHECK (bucket_key ~ '^[0-9a-f]{64}$'),

  CONSTRAINT rate_limit_buckets_request_count_nonnegative
    CHECK (request_count >= 0)
);

CREATE INDEX rate_limit_buckets_reset_at_idx
  ON rate_limit_buckets (reset_at);
