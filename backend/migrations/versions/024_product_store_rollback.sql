DELETE FROM media_assets WHERE owner_type = 'product_listing';

ALTER TABLE media_assets
  DROP CONSTRAINT media_assets_owner_type_check,
  ADD CONSTRAINT media_assets_owner_type_check
    CHECK (owner_type IN ('business_profile', 'professional_profile', 'user')),
  DROP CONSTRAINT media_assets_asset_type_check,
  ADD CONSTRAINT media_assets_asset_type_check
    CHECK (asset_type IN ('logo','cover','gallery','profile_image','service_image'));

DROP TABLE product_listings;
