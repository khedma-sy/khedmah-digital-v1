DROP TABLE IF EXISTS mobility_fare_policies;

DELETE FROM media_assets WHERE asset_type IN ('driver_photo','identity_card','driving_license','vehicle_license');
ALTER TABLE media_assets
  DROP CONSTRAINT media_assets_asset_type_check,
  ADD CONSTRAINT media_assets_asset_type_check CHECK (asset_type IN ('logo','cover','gallery','profile_image','service_image','product_image','problem_image','completion_image'));

DROP INDEX mobility_requests_one_open_per_rider_idx;
CREATE UNIQUE INDEX mobility_requests_one_open_per_rider_idx ON mobility_requests(rider_user_id)
  WHERE status IN ('requested','accepted','en_route');

ALTER TABLE mobility_request_events DROP CONSTRAINT mobility_request_events_to_status_check;
UPDATE mobility_request_events SET to_status='en_route' WHERE to_status IN ('arrived','in_progress');
ALTER TABLE mobility_request_events ADD CONSTRAINT mobility_request_events_to_status_check
  CHECK (to_status IN ('requested','accepted','en_route','completed','rejected','cancelled'));

ALTER TABLE mobility_requests DROP CONSTRAINT mobility_requests_status_check;
UPDATE mobility_requests SET status='en_route' WHERE status IN ('arrived','in_progress');
ALTER TABLE mobility_requests
  ADD CONSTRAINT mobility_requests_status_check CHECK (status IN ('requested','accepted','en_route','completed','rejected','cancelled')),
  DROP CONSTRAINT mobility_requests_fare_complete_check,
  DROP COLUMN final_fare,
  DROP COLUMN waiting_fare,
  DROP COLUMN distance_fare,
  DROP COLUMN fare_policy_updated_at,
  DROP COLUMN fare_minimum,
  DROP COLUMN fare_per_waiting_minute,
  DROP COLUMN fare_per_km,
  DROP COLUMN base_fare,
  DROP COLUMN fare_currency,
  DROP COLUMN fare_status,
  DROP COLUMN waiting_seconds,
  DROP COLUMN route_distance_meters,
  DROP COLUMN started_at,
  DROP COLUMN arrived_at;
