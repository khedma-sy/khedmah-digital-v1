-- Mission 009 approved identity foundation entities only.
-- Exactly three approved tables are created in this file.

CREATE TABLE user_accounts (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_profiles (
  user_id UUID PRIMARY KEY REFERENCES user_accounts(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'ar' CHECK (locale = 'ar'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  actor_user_id UUID REFERENCES user_accounts(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_id TEXT,
  correlation_id TEXT
);

CREATE INDEX audit_logs_actor_user_id_idx ON audit_logs(actor_user_id);
CREATE INDEX audit_logs_event_type_idx ON audit_logs(event_type);
CREATE INDEX audit_logs_occurred_at_idx ON audit_logs(occurred_at);
