-- Persistent, auditable review decisions for private driver documents.
CREATE TABLE mobility_document_reviews (
  media_asset_id TEXT PRIMARY KEY REFERENCES media_assets(id) ON DELETE CASCADE,
  business_profile_id TEXT NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('driver_photo','identity_card','driving_license','vehicle_license')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  review_reason TEXT,
  reviewed_by TEXT REFERENCES core_user_accounts(user_identifier) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mobility_document_reviews_business_type_unique UNIQUE (business_profile_id, document_type),
  CONSTRAINT mobility_document_reviews_decision_check CHECK (
    (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status = 'approved' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND review_reason IS NULL)
    OR (status = 'rejected' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND length(trim(review_reason)) >= 5)
  )
);

CREATE INDEX mobility_document_reviews_business_status_idx
  ON mobility_document_reviews(business_profile_id, status, document_type);

CREATE TABLE mobility_document_review_events (
  id TEXT PRIMARY KEY,
  media_asset_id TEXT NOT NULL,
  business_profile_id TEXT NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('driver_photo','identity_card','driving_license','vehicle_license')),
  status TEXT NOT NULL CHECK (status IN ('approved','rejected')),
  review_reason TEXT,
  actor_user_id TEXT REFERENCES core_user_accounts(user_identifier) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mobility_document_review_events_reason_check CHECK (
    status = 'approved' OR length(trim(review_reason)) >= 5
  )
);

CREATE INDEX mobility_document_review_events_business_created_idx
  ON mobility_document_review_events(business_profile_id, created_at DESC);

INSERT INTO mobility_document_reviews (media_asset_id, business_profile_id, document_type)
SELECT id, owner_id, asset_type
FROM media_assets
WHERE owner_type = 'business_profile'
  AND visibility = 'private'
  AND asset_type IN ('driver_photo','identity_card','driving_license','vehicle_license')
ON CONFLICT (business_profile_id, document_type) DO NOTHING;
