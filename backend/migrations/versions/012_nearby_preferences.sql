CREATE TABLE nearby_preferences (
  user_identifier TEXT PRIMARY KEY REFERENCES core_user_accounts(user_identifier) ON DELETE CASCADE,
  location_identifier TEXT NOT NULL REFERENCES locations(location_identifier) ON DELETE RESTRICT,
  coverage_radius NUMERIC(6,2) NOT NULL CHECK (coverage_radius > 0 AND coverage_radius <= 500),
  alerts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
