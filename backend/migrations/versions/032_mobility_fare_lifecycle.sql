-- Governed mobility lifecycle and platform-calculated fares.
-- Rates remain disabled until an authorized administrator approves them.
ALTER TABLE mobility_requests
  DROP CONSTRAINT mobility_requests_status_check,
  ADD CONSTRAINT mobility_requests_status_check
    CHECK (status IN ('requested','accepted','en_route','arrived','in_progress','completed','rejected','cancelled')),
  ADD COLUMN arrived_at TIMESTAMPTZ,
  ADD COLUMN started_at TIMESTAMPTZ,
  ADD COLUMN route_distance_meters INTEGER CHECK (route_distance_meters IS NULL OR route_distance_meters BETWEEN 0 AND 1000000),
  ADD COLUMN waiting_seconds INTEGER CHECK (waiting_seconds IS NULL OR waiting_seconds BETWEEN 0 AND 86400),
  ADD COLUMN fare_status TEXT NOT NULL DEFAULT 'pending' CHECK (fare_status IN ('pending','finalized','unavailable')),
  ADD COLUMN fare_currency TEXT NOT NULL DEFAULT 'SYP' CHECK (fare_currency IN ('SYP')),
  ADD COLUMN base_fare INTEGER CHECK (base_fare IS NULL OR base_fare >= 0),
  ADD COLUMN fare_per_km INTEGER CHECK (fare_per_km IS NULL OR fare_per_km >= 0),
  ADD COLUMN fare_per_waiting_minute INTEGER CHECK (fare_per_waiting_minute IS NULL OR fare_per_waiting_minute >= 0),
  ADD COLUMN fare_minimum INTEGER CHECK (fare_minimum IS NULL OR fare_minimum >= 0),
  ADD COLUMN fare_policy_updated_at TIMESTAMPTZ,
  ADD COLUMN distance_fare INTEGER CHECK (distance_fare IS NULL OR distance_fare >= 0),
  ADD COLUMN waiting_fare INTEGER CHECK (waiting_fare IS NULL OR waiting_fare >= 0),
  ADD COLUMN final_fare INTEGER CHECK (final_fare IS NULL OR final_fare >= 0),
  ADD CONSTRAINT mobility_requests_fare_complete_check CHECK (
    fare_status <> 'finalized' OR
    (base_fare IS NOT NULL AND fare_per_km IS NOT NULL AND fare_per_waiting_minute IS NOT NULL
      AND fare_minimum IS NOT NULL AND fare_policy_updated_at IS NOT NULL
      AND distance_fare IS NOT NULL AND waiting_fare IS NOT NULL AND final_fare IS NOT NULL
      AND route_distance_meters IS NOT NULL AND waiting_seconds IS NOT NULL)
  );

ALTER TABLE mobility_request_events
  DROP CONSTRAINT mobility_request_events_to_status_check,
  ADD CONSTRAINT mobility_request_events_to_status_check
    CHECK (to_status IN ('requested','accepted','en_route','arrived','in_progress','completed','rejected','cancelled'));

DROP INDEX mobility_requests_one_open_per_rider_idx;
CREATE UNIQUE INDEX mobility_requests_one_open_per_rider_idx ON mobility_requests(rider_user_id)
  WHERE status IN ('requested','accepted','en_route','arrived','in_progress');

CREATE TABLE mobility_fare_policies (
  service_type TEXT PRIMARY KEY CHECK (service_type IN ('taxi','delivery')),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  currency TEXT NOT NULL DEFAULT 'SYP' CHECK (currency IN ('SYP')),
  base_fare INTEGER NOT NULL DEFAULT 0 CHECK (base_fare >= 0),
  per_km_fare INTEGER NOT NULL DEFAULT 0 CHECK (per_km_fare >= 0),
  per_waiting_minute_fare INTEGER NOT NULL DEFAULT 0 CHECK (per_waiting_minute_fare >= 0),
  minimum_fare INTEGER NOT NULL DEFAULT 0 CHECK (minimum_fare >= 0),
  approved_by TEXT REFERENCES core_user_accounts(user_identifier) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mobility_fare_policy_activation_check CHECK (
    NOT enabled OR (base_fare > 0 AND per_km_fare > 0 AND minimum_fare >= base_fare AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
  )
);

INSERT INTO mobility_fare_policies (service_type) VALUES ('taxi'), ('delivery');

ALTER TABLE media_assets
  DROP CONSTRAINT media_assets_asset_type_check,
  ADD CONSTRAINT media_assets_asset_type_check CHECK (asset_type IN (
    'logo','cover','gallery','profile_image','service_image','product_image','problem_image','completion_image',
    'driver_photo','identity_card','driving_license','vehicle_license'
  ));
