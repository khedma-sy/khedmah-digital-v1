-- Governed driver-document review contract shared by Taxi and Delivery.
-- This migration deliberately does NOT restore the historical Mobility 025/032 schema.
ALTER TABLE media_assets
  DROP CONSTRAINT media_assets_asset_type_check,
  ADD CONSTRAINT media_assets_asset_type_check CHECK (asset_type IN (
    'logo','cover','gallery','profile_image','service_image','product_image',
    'driver_photo','identity_card','driving_license','vehicle_license'
  ));

ALTER TABLE media_assets
  DROP CONSTRAINT IF EXISTS media_assets_driver_documents_private_check,
  ADD CONSTRAINT media_assets_driver_documents_private_check CHECK (
    asset_type NOT IN ('driver_photo','identity_card','driving_license','vehicle_license')
    OR (owner_type = 'business_profile' AND visibility = 'private')
  );

CREATE TABLE mobility_document_reviews (
  media_asset_id TEXT PRIMARY KEY REFERENCES media_assets(id) ON DELETE CASCADE,
  business_profile_id TEXT NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('driver_photo','identity_card','driving_license','vehicle_license')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  review_reason TEXT CHECK (review_reason IS NULL OR CHAR_LENGTH(review_reason) <= 500),
  reviewed_by TEXT REFERENCES core_user_accounts(user_identifier) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mobility_document_review_decision_check CHECK (
    (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status = 'approved' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND review_reason IS NULL)
    OR (status = 'rejected' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND review_reason IS NOT NULL)
  )
);

CREATE TABLE mobility_document_review_events (
  id TEXT PRIMARY KEY,
  media_asset_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  business_profile_id TEXT NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('driver_photo','identity_card','driving_license','vehicle_license')),
  status TEXT NOT NULL CHECK (status IN ('approved','rejected')),
  review_reason TEXT,
  actor_user_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX mobility_document_reviews_business_idx
  ON mobility_document_reviews(business_profile_id, document_type, status, updated_at DESC);
CREATE INDEX mobility_document_review_events_business_idx
  ON mobility_document_review_events(business_profile_id, created_at DESC);

CREATE OR REPLACE FUNCTION create_pending_mobility_document_review()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.owner_type = 'business_profile'
     AND NEW.visibility = 'private'
     AND NEW.asset_type IN ('driver_photo','identity_card','driving_license','vehicle_license') THEN
    INSERT INTO mobility_document_reviews
      (media_asset_id, business_profile_id, document_type, status, created_at, updated_at)
    VALUES
      (NEW.id, NEW.owner_id, NEW.asset_type, 'pending', NEW.created_at, NEW.updated_at)
    ON CONFLICT (media_asset_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS media_assets_pending_mobility_document_review ON media_assets;
CREATE TRIGGER media_assets_pending_mobility_document_review
  AFTER INSERT ON media_assets
  FOR EACH ROW EXECUTE FUNCTION create_pending_mobility_document_review();

INSERT INTO mobility_document_reviews
  (media_asset_id, business_profile_id, document_type, status, created_at, updated_at)
SELECT id, owner_id, asset_type, 'pending', created_at, updated_at
FROM media_assets
WHERE owner_type='business_profile'
  AND visibility='private'
  AND asset_type IN ('driver_photo','identity_card','driving_license','vehicle_license')
ON CONFLICT (media_asset_id) DO NOTHING;
