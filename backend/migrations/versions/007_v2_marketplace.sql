-- KHEDMA DIGITAL V2 marketplace extension. Existing V1 identifiers remain canonical.
ALTER TABLE business_profiles
  ADD COLUMN IF NOT EXISTS service_radius_km NUMERIC(6,2) NOT NULL DEFAULT 25 CHECK (service_radius_km > 0 AND service_radius_km <= 500),
  ADD COLUMN IF NOT EXISTS availability TEXT NOT NULL DEFAULT 'available' CHECK (availability IN ('available', 'busy', 'unavailable')),
  ADD COLUMN IF NOT EXISTS rating NUMERIC(2,1) NOT NULL DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
  ADD COLUMN IF NOT EXISTS response_speed_minutes INTEGER NOT NULL DEFAULT 1440 CHECK (response_speed_minutes > 0);

CREATE INDEX IF NOT EXISTS business_profiles_geo_idx ON business_profiles(lat, lng)
  WHERE visibility = 'public' AND status = 'active';
CREATE INDEX IF NOT EXISTS business_profiles_availability_idx ON business_profiles(availability);

CREATE TABLE IF NOT EXISTS plans (
  code TEXT PRIMARY KEY CHECK (code IN ('FREE', 'PRO', 'BUSINESS')),
  name_ar TEXT NOT NULL,
  monthly_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (monthly_price >= 0),
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO plans (code, name_ar, features) VALUES
  ('FREE', 'مجاني', '{"profile":true,"monthly_requests":10}'),
  ('PRO', 'احترافي', '{"profile":true,"monthly_requests":100,"priority_search":true}'),
  ('BUSINESS', 'أعمال', '{"profile":true,"monthly_requests":-1,"priority_search":true,"team":true}')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE CASCADE,
  plan_code TEXT NOT NULL REFERENCES plans(code),
  status TEXT NOT NULL CHECK (status IN ('active', 'cancelled', 'expired')),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_active_owner_idx ON subscriptions(owner_user_id) WHERE status = 'active';
