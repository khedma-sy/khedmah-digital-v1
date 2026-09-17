-- Khedmah AI Admin control plane.
-- Disabled by default. This migration stores owner intent and an audit trail only;
-- it does not grant the AI direct database, cloud, or production access.

CREATE TABLE IF NOT EXISTS ai_admin_settings (
  setting_key TEXT PRIMARY KEY CHECK (setting_key = 'global'),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  operating_mode TEXT NOT NULL DEFAULT 'supervised' CHECK (operating_mode IN ('supervised')),
  monthly_budget_usd_cents INTEGER NOT NULL DEFAULT 5000 CHECK (monthly_budget_usd_cents BETWEEN 0 AND 100000),
  updated_by_user_id TEXT REFERENCES core_user_accounts(user_identifier) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO ai_admin_settings (setting_key, enabled, operating_mode, monthly_budget_usd_cents)
VALUES ('global', FALSE, 'supervised', 5000)
ON CONFLICT (setting_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS ai_admin_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id TEXT REFERENCES core_user_accounts(user_identifier) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('enabled', 'disabled')),
  previous_enabled BOOLEAN NOT NULL,
  next_enabled BOOLEAN NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_admin_audit_events_occurred_at_idx
  ON ai_admin_audit_events(occurred_at DESC);
