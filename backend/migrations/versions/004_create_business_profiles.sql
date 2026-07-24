-- Mission 069 — Business Profile Database Implementation Phase
-- Creates only specialized business profile identity data.

CREATE TABLE business_profiles (
  business_profile_identifier TEXT PRIMARY KEY,
  profile_identifier TEXT NOT NULL UNIQUE,
  business_type TEXT NOT NULL CHECK (business_type IN ('restaurant', 'shop', 'workshop', 'service_business', 'retail_business', 'factory', 'supplier_business', 'company')),
  business_status TEXT NOT NULL CHECK (business_status IN ('created', 'pending', 'active', 'suspended', 'archived')),
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private', 'internal')),
  lifecycle_status TEXT NOT NULL CHECK (lifecycle_status IN ('created', 'pending', 'active', 'suspended', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  CONSTRAINT business_profiles_profile_fk FOREIGN KEY (profile_identifier)
    REFERENCES profiles(profile_identifier),
  CONSTRAINT business_profiles_identifier_format CHECK (business_profile_identifier ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$'),
  CONSTRAINT business_profiles_profile_identifier_format CHECK (profile_identifier ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$'),
  CONSTRAINT business_profiles_status_lifecycle_match CHECK (business_status = lifecycle_status),
  CONSTRAINT business_profiles_archived_at_required CHECK (lifecycle_status <> 'archived' OR archived_at IS NOT NULL),
  CONSTRAINT business_profiles_updated_after_created CHECK (updated_at >= created_at)
);

CREATE INDEX business_profiles_business_type_idx ON business_profiles(business_type);
CREATE INDEX business_profiles_visibility_idx ON business_profiles(visibility);
CREATE INDEX business_profiles_lifecycle_status_idx ON business_profiles(lifecycle_status);
