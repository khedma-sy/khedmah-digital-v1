-- Migration 004: Analytics events, contact inquiries, contact action events
-- Forward migration

CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  anonymous_id TEXT,
  session_reference TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  request_id TEXT,
  correlation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS analytics_events_entity_idx ON analytics_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS analytics_events_occurred_idx ON analytics_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_type_idx ON analytics_events(event_type);

-- Business must precede the historical 007/008 extensions and Contact targets.
CREATE TABLE IF NOT EXISTS business_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description_ar TEXT,
  description_en TEXT,
  owner_user_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE RESTRICT,
  organization_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('public','private')),
  moderation_status TEXT NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending','approved','rejected','suspended')),
  trust_status TEXT NOT NULL DEFAULT 'pending' CHECK (trust_status IN ('pending','approved','suspended')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  phone TEXT,
  email TEXT,
  website TEXT,
  category_code TEXT NOT NULL,
  city_code TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'SY',
  lat NUMERIC,
  lng NUMERIC,
  address_ar TEXT,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  featured_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX business_profiles_owner_idx ON business_profiles(owner_user_id);
CREATE INDEX business_profiles_public_eligibility_idx ON business_profiles(created_at DESC)
  WHERE visibility = 'public' AND moderation_status = 'approved' AND trust_status = 'approved' AND status = 'active';

CREATE TABLE IF NOT EXISTS contact_inquiries (
  id TEXT PRIMARY KEY,
  business_profile_id TEXT NOT NULL REFERENCES business_profiles(id) ON DELETE RESTRICT,
  submitter_user_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'received', 'read', 'responded', 'closed')),
  request_id TEXT,
  correlation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contact_inquiries_business_idx ON contact_inquiries(business_profile_id);
CREATE INDEX IF NOT EXISTS contact_inquiries_submitter_idx ON contact_inquiries(submitter_user_id);
CREATE INDEX IF NOT EXISTS contact_inquiries_created_idx ON contact_inquiries(created_at DESC);

CREATE TABLE IF NOT EXISTS contact_action_events (
  id TEXT PRIMARY KEY,
  business_profile_id TEXT NOT NULL,
  actor_user_id TEXT,
  action_type TEXT NOT NULL CHECK (action_type IN ('contact_click', 'click_phone', 'click_website', 'click_email', 'click_map', 'click_social')),
  action_target TEXT,
  request_id TEXT,
  correlation_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contact_action_events_business_idx ON contact_action_events(business_profile_id);
CREATE INDEX IF NOT EXISTS contact_action_events_occurred_idx ON contact_action_events(occurred_at DESC);
