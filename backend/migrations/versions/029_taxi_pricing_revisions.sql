-- Governed Taxi pricing revisions for the 2026 new Syrian pound.
-- Amounts are stored in minor units (qirsh): 100 qirsh = 1 new Syrian pound.
CREATE TABLE taxi_pricing_revisions (
  id TEXT PRIMARY KEY,
  zone_code TEXT NOT NULL,
  revision BIGINT NOT NULL CHECK (revision > 0),
  currency TEXT NOT NULL DEFAULT 'SYP' CHECK (currency = 'SYP'),
  currency_era TEXT NOT NULL DEFAULT 'SYP_NEW_2026' CHECK (currency_era = 'SYP_NEW_2026'),
  opening_fare_minor BIGINT NOT NULL CHECK (opening_fare_minor >= 0),
  per_km_minor BIGINT NOT NULL CHECK (per_km_minor >= 0),
  wait_per_minute_minor BIGINT NOT NULL CHECK (wait_per_minute_minor >= 0),
  booking_fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (booking_fee_minor >= 0),
  minimum_fare_minor BIGINT NOT NULL CHECK (minimum_fare_minor >= 0),
  demand_multiplier_bps INTEGER NOT NULL DEFAULT 10000 CHECK (demand_multiplier_bps BETWEEN 10000 AND 20000),
  effective_base_minor BIGINT NOT NULL CHECK (effective_base_minor >= 0),
  effective_per_km_minor BIGINT NOT NULL CHECK (effective_per_km_minor >= 0),
  effective_wait_per_minute_minor BIGINT NOT NULL CHECK (effective_wait_per_minute_minor >= 0),
  max_amount_minor BIGINT NOT NULL CHECK (max_amount_minor > 0),
  quote_ttl_ms INTEGER NOT NULL CHECK (quote_ttl_ms BETWEEN 30000 AND 900000),
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 5 AND 300),
  created_by TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE RESTRICT,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT taxi_pricing_revisions_zone_revision_unique UNIQUE (zone_code, revision),
  CONSTRAINT taxi_pricing_revisions_amount_ceiling_check CHECK (
    opening_fare_minor <= max_amount_minor
    AND per_km_minor <= max_amount_minor
    AND wait_per_minute_minor <= max_amount_minor
    AND booking_fee_minor <= max_amount_minor
    AND minimum_fare_minor <= max_amount_minor
    AND effective_base_minor <= max_amount_minor
    AND effective_per_km_minor <= max_amount_minor
    AND effective_wait_per_minute_minor <= max_amount_minor
  )
);

CREATE INDEX taxi_pricing_revisions_zone_activated_idx
  ON taxi_pricing_revisions(zone_code, activated_at DESC, revision DESC);

CREATE OR REPLACE FUNCTION reject_taxi_pricing_revision_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'taxi pricing history is append-only' USING ERRCODE='55000';
END;
$$;

CREATE TRIGGER taxi_pricing_revisions_append_only
BEFORE UPDATE OR DELETE ON taxi_pricing_revisions
FOR EACH ROW EXECUTE FUNCTION reject_taxi_pricing_revision_mutation();
