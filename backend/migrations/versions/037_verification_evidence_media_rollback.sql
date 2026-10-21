-- Restore migration 027's media contract only when no verification evidence would be lost.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM media_assets
    WHERE asset_type IN ('business_verification_evidence','professional_verification_evidence')
  ) THEN
    RAISE EXCEPTION 'MIGRATION_037_ROLLBACK_BLOCKED: verification evidence exists';
  END IF;
END $$;

ALTER TABLE media_assets
  DROP CONSTRAINT IF EXISTS media_assets_verification_evidence_private_check;

ALTER TABLE media_assets
  DROP CONSTRAINT media_assets_asset_type_check,
  ADD CONSTRAINT media_assets_asset_type_check CHECK (asset_type IN (
    'logo','cover','gallery','profile_image','service_image','product_image','ad_image',
    'driver_photo','identity_card','driving_license','vehicle_license'
  ));
