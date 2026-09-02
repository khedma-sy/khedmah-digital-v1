-- Mobility request lifecycle. No pricing, payment, automatic dispatch, or live tracking.
CREATE TABLE mobility_requests (
  id TEXT PRIMARY KEY,
  rider_user_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE RESTRICT,
  provider_business_id TEXT NOT NULL REFERENCES business_profiles(id) ON DELETE RESTRICT,
  service_type TEXT NOT NULL CHECK (service_type IN ('taxi','delivery')),
  pickup_address TEXT NOT NULL CHECK (CHAR_LENGTH(BTRIM(pickup_address)) BETWEEN 2 AND 300),
  destination_address TEXT NOT NULL CHECK (CHAR_LENGTH(BTRIM(destination_address)) BETWEEN 2 AND 300),
  rider_contact_phone TEXT NOT NULL CHECK (CHAR_LENGTH(BTRIM(rider_contact_phone)) BETWEEN 6 AND 30),
  pickup_latitude NUMERIC(9,6) NOT NULL CHECK (pickup_latitude BETWEEN -90 AND 90),
  pickup_longitude NUMERIC(9,6) NOT NULL CHECK (pickup_longitude BETWEEN -180 AND 180),
  destination_latitude NUMERIC(9,6) CHECK (destination_latitude BETWEEN -90 AND 90),
  destination_longitude NUMERIC(9,6) CHECK (destination_longitude BETWEEN -180 AND 180),
  rider_note TEXT CHECK (rider_note IS NULL OR CHAR_LENGTH(rider_note) <= 500),
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','accepted','en_route','completed','rejected','cancelled')),
  idempotency_key TEXT NOT NULL CHECK (CHAR_LENGTH(idempotency_key) BETWEEN 16 AND 128),
  accepted_at TIMESTAMPTZ,
  en_route_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mobility_requests_destination_coordinates_pair CHECK ((destination_latitude IS NULL) = (destination_longitude IS NULL)),
  CONSTRAINT mobility_requests_rider_idempotency_unique UNIQUE (rider_user_id, idempotency_key)
);

CREATE UNIQUE INDEX mobility_requests_one_open_per_rider_idx ON mobility_requests(rider_user_id)
  WHERE status IN ('requested','accepted','en_route');
CREATE INDEX mobility_requests_rider_created_idx ON mobility_requests(rider_user_id, created_at DESC);
CREATE INDEX mobility_requests_provider_status_created_idx ON mobility_requests(provider_business_id, status, created_at DESC);

CREATE TABLE mobility_request_events (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES mobility_requests(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE RESTRICT,
  from_status TEXT,
  to_status TEXT NOT NULL CHECK (to_status IN ('requested','accepted','en_route','completed','rejected','cancelled')),
  reason TEXT CHECK (reason IS NULL OR CHAR_LENGTH(reason) <= 300),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX mobility_request_events_request_time_idx ON mobility_request_events(request_id, occurred_at);
