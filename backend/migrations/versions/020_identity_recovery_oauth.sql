-- Production identity closure: password recovery tokens and external identity bindings.

CREATE TABLE password_reset_tokens (
  reset_identifier TEXT PRIMARY KEY,
  user_identifier TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT password_reset_tokens_expiry_after_creation CHECK (expires_at > created_at),
  CONSTRAINT password_reset_tokens_used_after_creation CHECK (used_at IS NULL OR used_at >= created_at)
);
CREATE INDEX password_reset_tokens_user_created_idx ON password_reset_tokens(user_identifier, created_at DESC);
CREATE INDEX password_reset_tokens_expires_at_idx ON password_reset_tokens(expires_at);

CREATE TABLE external_identities (
  provider TEXT NOT NULL CHECK (provider IN ('google', 'facebook')),
  provider_subject TEXT NOT NULL,
  user_identifier TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider, provider_subject),
  CONSTRAINT external_identities_provider_user_unique UNIQUE (provider, user_identifier),
  CONSTRAINT external_identities_email_normalized CHECK (email = LOWER(BTRIM(email)))
);
CREATE INDEX external_identities_user_idx ON external_identities(user_identifier);
