ALTER TABLE contact_inquiries DROP COLUMN IF EXISTS tracking_status, DROP COLUMN IF EXISTS service_lng,
  DROP COLUMN IF EXISTS service_lat, DROP COLUMN IF EXISTS service_address, DROP COLUMN IF EXISTS service_id;
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS plans;
DROP INDEX IF EXISTS business_profiles_availability_idx;
DROP INDEX IF EXISTS business_profiles_geo_idx;
ALTER TABLE business_profiles DROP COLUMN IF EXISTS response_speed_minutes, DROP COLUMN IF EXISTS rating,
  DROP COLUMN IF EXISTS availability, DROP COLUMN IF EXISTS service_radius_km;
