DROP TRIGGER IF EXISTS media_assets_pending_mobility_document_review ON media_assets;
DROP FUNCTION IF EXISTS create_pending_mobility_document_review();
DROP TABLE IF EXISTS mobility_document_review_events;
DROP TABLE IF EXISTS mobility_document_reviews;
ALTER TABLE media_assets DROP CONSTRAINT IF EXISTS media_assets_driver_documents_private_check;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM media_assets
    WHERE asset_type IN ('driver_photo','identity_card','driving_license','vehicle_license')
  ) THEN
    RAISE EXCEPTION 'Cannot restore the post-Classifieds media constraint while driver documents still exist.';
  END IF;
END $$;

-- Return exactly to the Migration 025 Classifieds media contract.
ALTER TABLE media_assets
  DROP CONSTRAINT media_assets_asset_type_check,
  ADD CONSTRAINT media_assets_asset_type_check CHECK (asset_type IN (
    'logo','cover','gallery','profile_image','service_image','product_image','ad_image'
  ));
