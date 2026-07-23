-- Analytics foundation database boundary for Khedmah Digital V1.
-- Creates only the approved analytics_events entity for privacy-aware event recording.

CREATE TABLE analytics_events (
  id UUID PRIMARY KEY,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  anonymous_id TEXT,
  session_reference TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
