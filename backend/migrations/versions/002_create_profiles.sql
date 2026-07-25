-- Mission 069P — canonical base Profile persistence only.
-- Visibility is a classification value; it does not grant permission, authorization, or ownership.

CREATE TABLE profiles (
  profile_identifier TEXT PRIMARY KEY,
  user_identifier TEXT NOT NULL UNIQUE,
  profile_type TEXT NOT NULL CHECK (profile_type IN ('personal_profile', 'professional_profile', 'business_profile', 'organization_profile', 'partner_profile', 'representative_profile')),
  display_name TEXT NOT NULL,
  lifecycle_status TEXT NOT NULL CHECK (lifecycle_status IN ('created', 'pending', 'active', 'suspended', 'archived')),
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private', 'internal')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  CONSTRAINT profiles_identifier_owner_unique UNIQUE (profile_identifier, user_identifier),
  CONSTRAINT profiles_user_reference_fk FOREIGN KEY (user_identifier) REFERENCES core_user_accounts(user_identifier) ON DELETE RESTRICT,
  CONSTRAINT profiles_identifier_format CHECK (profile_identifier ~ '^profile_[A-Za-z0-9][A-Za-z0-9_-]{7,127}$'),
  CONSTRAINT profiles_display_name_safe CHECK (CHAR_LENGTH(BTRIM(display_name)) BETWEEN 1 AND 120 AND display_name !~ '[[:cntrl:]]'),
  CONSTRAINT profiles_archived_at_required CHECK (lifecycle_status <> 'archived' OR archived_at IS NOT NULL),
  CONSTRAINT profiles_archived_at_after_created CHECK (archived_at IS NULL OR archived_at >= created_at),
  CONSTRAINT profiles_updated_after_created CHECK (updated_at >= created_at)
);

CREATE INDEX profiles_lifecycle_status_idx ON profiles(lifecycle_status);
CREATE INDEX profiles_visibility_idx ON profiles(visibility);
