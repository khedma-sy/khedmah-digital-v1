-- Mission 069Q — canonical Professional Profile identity extension only.
-- Visibility is classification only; it grants no permission, authorization, or verification.

CREATE TABLE professional_profiles (
  professional_profile_identifier TEXT PRIMARY KEY,
  profile_identifier TEXT NOT NULL UNIQUE,
  user_identifier TEXT NOT NULL,
  profession_type TEXT NOT NULL CHECK (profession_type IN ('doctor', 'dentist', 'engineer', 'lawyer', 'consultant', 'freelancer', 'technical_specialist')),
  lifecycle_status TEXT NOT NULL CHECK (lifecycle_status IN ('created', 'pending', 'active', 'suspended', 'archived')),
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private', 'internal')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  CONSTRAINT professional_profiles_profile_owner_fk FOREIGN KEY (profile_identifier, user_identifier) REFERENCES profiles(profile_identifier, user_identifier) ON DELETE RESTRICT,
  CONSTRAINT professional_profiles_identifier_format CHECK (professional_profile_identifier ~ '^professional_profile_[A-Za-z0-9][A-Za-z0-9_-]{7,127}$'),
  CONSTRAINT professional_profiles_archived_at_required CHECK (lifecycle_status <> 'archived' OR archived_at IS NOT NULL),
  CONSTRAINT professional_profiles_archived_at_after_created CHECK (archived_at IS NULL OR archived_at >= created_at),
  CONSTRAINT professional_profiles_updated_after_created CHECK (updated_at >= created_at)
);

CREATE INDEX professional_profiles_user_identifier_idx ON professional_profiles(user_identifier);
CREATE INDEX professional_profiles_profession_type_idx ON professional_profiles(profession_type);
CREATE INDEX professional_profiles_lifecycle_status_idx ON professional_profiles(lifecycle_status);
CREATE INDEX professional_profiles_visibility_idx ON professional_profiles(visibility);
