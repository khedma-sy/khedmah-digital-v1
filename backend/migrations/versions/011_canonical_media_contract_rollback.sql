DROP INDEX IF EXISTS media_assets_owner_asset_idx;
ALTER TABLE media_assets DROP COLUMN IF EXISTS sort_order, DROP COLUMN IF EXISTS asset_type;
