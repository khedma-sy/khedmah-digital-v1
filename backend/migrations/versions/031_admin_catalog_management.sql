CREATE TABLE admin_catalog_actions (
  id TEXT PRIMARY KEY,
  category_code TEXT NOT NULL REFERENCES categories(code) ON UPDATE CASCADE ON DELETE RESTRICT,
  actor_user_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('activated','deactivated')),
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 5 AND 500),
  previous_status TEXT NOT NULL CHECK (previous_status IN ('active','inactive')),
  new_status TEXT NOT NULL CHECK (new_status IN ('active','inactive')),
  request_id TEXT,
  correlation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_catalog_actions_status_change_check CHECK (previous_status <> new_status)
);
CREATE INDEX admin_catalog_actions_category_created_idx ON admin_catalog_actions(category_code,created_at DESC);
