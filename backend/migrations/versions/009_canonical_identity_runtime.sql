-- Canonical runtime identity bridge. Credentials remain private and separate from public account/profile records.
CREATE TABLE identity_credentials (
  user_identifier TEXT PRIMARY KEY REFERENCES core_user_accounts(user_identifier) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT identity_credentials_email_normalized CHECK (email = LOWER(BTRIM(email)))
);

ALTER TABLE profiles ADD COLUMN locale TEXT NOT NULL DEFAULT 'ar' CHECK (locale = 'ar');

CREATE TABLE identity_sessions (
  session_identifier TEXT PRIMARY KEY,
  user_identifier TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT identity_sessions_expiry_after_creation CHECK (expires_at > created_at),
  CONSTRAINT identity_sessions_revocation_after_creation CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);
CREATE INDEX identity_sessions_user_identifier_idx ON identity_sessions(user_identifier);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  actor_user_id TEXT REFERENCES core_user_accounts(user_identifier) ON DELETE SET NULL,
  request_id TEXT,
  correlation_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX audit_logs_event_type_idx ON audit_logs(event_type);
