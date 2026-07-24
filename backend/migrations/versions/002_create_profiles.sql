-- Mission 068 — Profile Database Implementation Phase
-- Forward migration: creates only the base profile persistence table.
-- Specialized profile entities and private profile data are intentionally excluded.

CREATE TABLE profiles (
  profile_identifier TEXT PRIMARY KEY,
  user_identifier TEXT NOT NULL UNIQUE,
  profile_type TEXT NOT NULL CHECK (profile_type IN ('personal_profile', 'professional_profile', 'business_profile', 'organization_profile', 'partner_profile', 'representative_profile')),
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private', 'internal')),
  lifecycle_status TEXT NOT NULL CHECK (lifecycle_status IN ('created', 'pending', 'active', 'suspended', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  CONSTRAINT profiles_user_account_fk FOREIGN KEY (user_identifier)
    REFERENCES core_user_accounts(user_identifier),
  CONSTRAINT profiles_profile_identifier_format CHECK (profile_identifier ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$'),
  CONSTRAINT profiles_user_identifier_format CHECK (user_identifier ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$'),
  CONSTRAINT profiles_archived_at_required CHECK (lifecycle_status <> 'archived' OR archived_at IS NOT NULL),
  CONSTRAINT profiles_updated_after_created CHECK (updated_at >= created_at)
);

CREATE INDEX profiles_profile_type_idx ON profiles(profile_type);
CREATE INDEX profiles_visibility_idx ON profiles(visibility);
CREATE INDEX profiles_lifecycle_status_idx ON profiles(lifecycle_status);
