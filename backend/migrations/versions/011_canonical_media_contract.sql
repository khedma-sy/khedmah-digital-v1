-- One media_assets contract: retain private ownership/storage fields and add the profile presentation projection.
ALTER TABLE media_assets
  ADD COLUMN asset_type TEXT CONSTRAINT media_assets_asset_type_check
    CHECK (asset_type IN ('logo','cover','gallery','profile_image','service_image')),
  ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
CREATE INDEX media_assets_owner_asset_idx ON media_assets(owner_type, owner_id, asset_type, sort_order);
