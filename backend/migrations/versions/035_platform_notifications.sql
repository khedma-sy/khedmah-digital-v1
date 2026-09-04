-- Durable, user-owned notifications for order and mobility lifecycle events.
CREATE TABLE platform_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT platform_notifications_user_event_unique UNIQUE (user_id, event_key),
  CONSTRAINT platform_notifications_event_type_check CHECK (event_type IN ('order.created','order.status_changed','mobility.created','mobility.status_changed')),
  CONSTRAINT platform_notifications_reference_type_check CHECK (reference_type IN ('order','mobility')),
  CONSTRAINT platform_notifications_metadata_object_check CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX platform_notifications_user_created_idx
  ON platform_notifications(user_id, created_at DESC, id DESC);
CREATE INDEX platform_notifications_user_unread_idx
  ON platform_notifications(user_id, created_at DESC) WHERE read_at IS NULL;
