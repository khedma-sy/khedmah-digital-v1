-- Permit only governed, private verification-evidence images on matching profile owners.
-- Migration 027 is the media-type predecessor; migration 036 is function-only and does
-- not alter the media contract.
ALTER TABLE media_assets
  DROP CONSTRAINT media_assets_asset_type_check,
  ADD CONSTRAINT media_assets_asset_type_check CHECK (asset_type IN (
    'logo','cover','gallery','profile_image','service_image','product_image','ad_image',
    'driver_photo','identity_card','driving_license','vehicle_license',
    'business_verification_evidence','professional_verification_evidence'
  ));

ALTER TABLE media_assets
  DROP CONSTRAINT IF EXISTS media_assets_verification_evidence_private_check,
  ADD CONSTRAINT media_assets_verification_evidence_private_check CHECK (
    asset_type IS NULL
    OR (asset_type = 'business_verification_evidence'
      AND owner_type = 'business_profile' AND visibility = 'private')
    OR (asset_type = 'professional_verification_evidence'
      AND owner_type = 'professional_profile' AND visibility = 'private')
    OR asset_type NOT IN ('business_verification_evidence','professional_verification_evidence')
  );
