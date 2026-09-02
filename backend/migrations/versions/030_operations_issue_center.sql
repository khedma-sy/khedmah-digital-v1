-- Durable operations issue center with accountable lifecycle transitions.
CREATE TABLE operations_incidents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 120),
  summary TEXT NOT NULL CHECK (char_length(btrim(summary)) BETWEEN 10 AND 2000),
  category TEXT NOT NULL CHECK (category IN ('technical','user_support','content','payments','delivery','security','other')),
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','verification','resolved')),
  reporter_user_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE RESTRICT,
  assignee_user_id TEXT REFERENCES core_user_accounts(user_identifier) ON DELETE SET NULL,
  resolution_note TEXT CHECK (resolution_note IS NULL OR char_length(btrim(resolution_note)) BETWEEN 5 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  CONSTRAINT operations_incidents_resolution_check CHECK ((status = 'resolved') = (resolved_at IS NOT NULL))
);

CREATE INDEX operations_incidents_queue_idx ON operations_incidents(status, severity, created_at);
CREATE INDEX operations_incidents_assignee_idx ON operations_incidents(assignee_user_id, status) WHERE assignee_user_id IS NOT NULL;

CREATE TABLE operations_incident_events (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES operations_incidents(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN ('created','assigned','started','sent_to_verification','resolved','reopened')),
  previous_status TEXT,
  new_status TEXT NOT NULL,
  note TEXT NOT NULL CHECK (char_length(btrim(note)) BETWEEN 5 AND 2000),
  request_id TEXT,
  correlation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX operations_incident_events_incident_time_idx ON operations_incident_events(incident_id, created_at);
