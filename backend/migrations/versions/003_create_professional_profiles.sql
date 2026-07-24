-- Mission 069 — Professional Profile Database Implementation Phase
-- Creates only specialized professional profile identity data.

CREATE TABLE professional_profiles (
  professional_profile_identifier TEXT PRIMARY KEY,
  profile_identifier TEXT NOT NULL UNIQUE,
  profession_type TEXT NOT NULL CHECK (profession_type IN ('doctor', 'dentist', 'engineer', 'lawyer', 'consultant', 'freelancer', 'technical_specialist', 'other_professional')),
  professional_status TEXT NOT NULL CHECK (professional_status IN ('created', 'pending', 'active', 'suspended', 'archived')),
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private', 'internal')),
  lifecycle_status TEXT NOT NULL CHECK (lifecycle_status IN ('created', 'pending', 'active', 'suspended', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  CONSTRAINT professional_profiles_profile_fk FOREIGN KEY (profile_identifier)
    REFERENCES profiles(profile_identifier),
  CONSTRAINT professional_profiles_identifier_format CHECK (professional_profile_identifier ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$'),
  CONSTRAINT professional_profiles_profile_identifier_format CHECK (profile_identifier ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$'),
  CONSTRAINT professional_profiles_status_lifecycle_match CHECK (professional_status = lifecycle_status),
  CONSTRAINT professional_profiles_archived_at_required CHECK (lifecycle_status <> 'archived' OR archived_at IS NOT NULL),
  CONSTRAINT professional_profiles_updated_after_created CHECK (updated_at >= created_at)
);

CREATE INDEX professional_profiles_profession_type_idx ON professional_profiles(profession_type);
CREATE INDEX professional_profiles_visibility_idx ON professional_profiles(visibility);
CREATE INDEX professional_profiles_lifecycle_status_idx ON professional_profiles(lifecycle_status);
