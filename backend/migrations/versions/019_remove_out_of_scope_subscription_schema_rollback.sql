-- Rollback for migration 019.
-- Restores historical subscription schema only.

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

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_active_owner_idx
ON subscriptions(owner_user_id)
WHERE status = 'active';
