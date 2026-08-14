-- Migration 005: Email verifications and admin roles
-- Forward migration

CREATE TABLE IF NOT EXISTS email_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_verifications_user_idx ON email_verifications(user_id);
CREATE INDEX IF NOT EXISTS email_verifications_token_idx ON email_verifications(token_hash);
CREATE INDEX IF NOT EXISTS email_verifications_created_idx ON email_verifications(created_at DESC);

CREATE TABLE IF NOT EXISTS admin_roles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('bootstrap_admin', 'platform_admin', 'moderator')),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_roles_user_role_unique UNIQUE (user_id, role)
);

CREATE INDEX IF NOT EXISTS admin_roles_user_idx ON admin_roles(user_id);
CREATE INDEX IF NOT EXISTS admin_roles_role_idx ON admin_roles(role);
