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

CREATE TABLE IF NOT EXISTS contact_inquiries (
  id TEXT PRIMARY KEY,
  business_profile_id TEXT NOT NULL,
  submitter_user_id TEXT NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'read', 'responded', 'closed')),
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
  action_type TEXT NOT NULL CHECK (action_type IN ('click_phone', 'click_website', 'click_email', 'click_map', 'click_social')),
  action_target TEXT,
  request_id TEXT,
  correlation_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contact_action_events_business_idx ON contact_action_events(business_profile_id);
CREATE INDEX IF NOT EXISTS contact_action_events_occurred_idx ON contact_action_events(occurred_at DESC);
