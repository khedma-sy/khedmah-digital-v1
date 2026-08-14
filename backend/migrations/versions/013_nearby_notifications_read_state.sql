CREATE TABLE nearby_notifications (
  notification_identifier TEXT PRIMARY KEY,
  user_identifier TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE CASCADE,
  business_profile_id TEXT NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT nearby_notifications_user_idempotency_unique UNIQUE (user_identifier, idempotency_key)
);
CREATE UNIQUE INDEX nearby_notifications_user_idempotency_idx ON nearby_notifications(user_identifier, idempotency_key);
CREATE INDEX nearby_notifications_unread_idx ON nearby_notifications(user_identifier, created_at DESC) WHERE read_at IS NULL;
