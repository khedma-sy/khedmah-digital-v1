-- Migration 006: Media assets table
-- Forward migration

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE CASCADE,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('business_profile', 'professional_profile', 'user')),
  owner_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private')) DEFAULT 'private',
  storage_key TEXT NOT NULL,
  public_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS media_assets_owner_idx ON media_assets(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS media_assets_user_idx ON media_assets(owner_user_id);
CREATE INDEX IF NOT EXISTS media_assets_created_idx ON media_assets(created_at DESC);
