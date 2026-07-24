-- Mission 067 — Core Identity Database Implementation Phase
-- Forward migration: creates only the approved core identity user account table.
-- No passwords, tokens, credentials, profile data, business data, organization data, service data, marketplace data, payment data, or tracking data are stored here.

CREATE TABLE core_user_accounts (
  user_identifier TEXT PRIMARY KEY,
  identity_reference TEXT NOT NULL UNIQUE,
  account_type TEXT NOT NULL CHECK (account_type IN ('individual_user', 'professional_account', 'business_account', 'organization_account', 'partner_account')),
  account_status TEXT NOT NULL CHECK (account_status IN ('created', 'pending', 'active', 'suspended', 'archived')),
  lifecycle_status TEXT NOT NULL CHECK (lifecycle_status IN ('created', 'pending', 'active', 'suspended', 'archived')),
  visibility_classification TEXT NOT NULL CHECK (visibility_classification IN ('public', 'private', 'internal')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  CONSTRAINT core_user_accounts_user_identifier_format CHECK (user_identifier ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$'),
  CONSTRAINT core_user_accounts_identity_reference_format CHECK (identity_reference ~ '^identity_[A-Za-z0-9][A-Za-z0-9_-]{7,127}$'),
  CONSTRAINT core_user_accounts_archived_at_required CHECK (lifecycle_status <> 'archived' OR archived_at IS NOT NULL),
  CONSTRAINT core_user_accounts_updated_after_created CHECK (updated_at >= created_at)
);

CREATE INDEX core_user_accounts_identity_reference_idx ON core_user_accounts(identity_reference);
CREATE INDEX core_user_accounts_account_status_idx ON core_user_accounts(account_status);
CREATE INDEX core_user_accounts_lifecycle_status_idx ON core_user_accounts(lifecycle_status);
