CREATE TABLE admin_user_actions (
  id TEXT PRIMARY KEY,
  target_user_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE RESTRICT,
  actor_user_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('suspended','reactivated')),
  reason TEXT NOT NULL CHECK (CHAR_LENGTH(BTRIM(reason)) BETWEEN 5 AND 500),
  previous_status TEXT NOT NULL CHECK (previous_status IN ('active','suspended')),
  new_status TEXT NOT NULL CHECK (new_status IN ('active','suspended')),
  request_id TEXT,
  correlation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_user_actions_status_change_check CHECK (previous_status <> new_status)
);

CREATE INDEX admin_user_actions_target_created_idx ON admin_user_actions(target_user_id, created_at DESC);
CREATE INDEX admin_user_actions_actor_created_idx ON admin_user_actions(actor_user_id, created_at DESC);
