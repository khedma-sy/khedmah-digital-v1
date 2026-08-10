-- Preserve applied migration 007 while exposing the canonical provider service_radius field.
ALTER TABLE business_profiles
  ADD COLUMN IF NOT EXISTS service_radius NUMERIC(6,2)
    CONSTRAINT business_profiles_service_radius_range CHECK (service_radius > 0 AND service_radius <= 500);

UPDATE business_profiles
SET service_radius = service_radius_km
WHERE service_radius IS NULL;

ALTER TABLE business_profiles
  ALTER COLUMN service_radius SET DEFAULT 25,
  ALTER COLUMN service_radius SET NOT NULL;
