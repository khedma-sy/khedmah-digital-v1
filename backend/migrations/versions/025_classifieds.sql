-- Independent free classifieds. No cart, ordering, payments, commissions, ranking auctions or tracking.
CREATE TABLE ad_listings (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE RESTRICT,
  business_profile_id TEXT REFERENCES business_profiles(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('sale','service','wanted','rent')),
  title_ar TEXT NOT NULL CHECK (CHAR_LENGTH(BTRIM(title_ar)) BETWEEN 2 AND 160),
  description_ar TEXT CHECK (description_ar IS NULL OR CHAR_LENGTH(description_ar) <= 4000),
  category_code TEXT NOT NULL REFERENCES categories(code) ON UPDATE CASCADE,
  price_mode TEXT NOT NULL CHECK (price_mode IN ('fixed','negotiable','contact','none')),
  price_minor BIGINT CHECK (price_minor IS NULL OR price_minor > 0),
  currency TEXT CHECK (currency IS NULL OR currency IN ('SYP','USD')),
  city_code TEXT,
  area_text TEXT CHECK (area_text IS NULL OR CHAR_LENGTH(area_text) <= 160),
  contact_mode TEXT NOT NULL CHECK (contact_mode IN ('profile','phone','whatsapp')),
  contact_value TEXT CHECK (contact_value IS NULL OR CHAR_LENGTH(contact_value) <= 80),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_review','active','inactive','expired','rejected')),
  rejection_reason TEXT,
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  content_revision BIGINT NOT NULL DEFAULT 1 CHECK (content_revision > 0),
  review_revision BIGINT NOT NULL DEFAULT 0 CHECK (review_revision >= 0),
  expires_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ad_listing_identity_owner_unique UNIQUE(id, owner_user_id),
  CONSTRAINT ad_price_contract CHECK (
    (price_mode='fixed' AND price_minor IS NOT NULL AND currency IS NOT NULL)
    OR (price_mode<>'fixed' AND price_minor IS NULL AND currency IS NULL)
  ),
  CONSTRAINT ad_contact_contract CHECK (
    (contact_mode='profile' AND contact_value IS NULL)
    OR (contact_mode IN ('phone','whatsapp') AND contact_value IS NOT NULL AND CHAR_LENGTH(BTRIM(contact_value)) >= 6)
  ),
  CONSTRAINT ad_rejection_reason_contract CHECK (
    (status='rejected' AND rejection_reason IS NOT NULL AND CHAR_LENGTH(BTRIM(rejection_reason)) >= 2)
    OR (status<>'rejected' AND rejection_reason IS NULL)
  )
);

CREATE INDEX ad_listings_owner_created_idx ON ad_listings(owner_user_id, created_at DESC);
CREATE INDEX ad_listings_public_idx ON ad_listings(category_code, city_code, created_at DESC)
  WHERE status='active';
CREATE INDEX ad_listings_pending_idx ON ad_listings(submitted_at ASC, updated_at ASC)
  WHERE status='pending_review';

-- Three durable free publication slots per account. Draft creation does not consume a slot.
CREATE TABLE ad_free_slots (
  ad_id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ad_free_slot_owner_fk FOREIGN KEY(ad_id, owner_user_id)
    REFERENCES ad_listings(id, owner_user_id) ON DELETE RESTRICT
);
CREATE INDEX ad_free_slots_owner_idx ON ad_free_slots(owner_user_id, consumed_at);

CREATE TABLE ad_request_receipts (
  owner_user_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('create','update','media','submit','deactivate','reactivate')),
  request_id TEXT NOT NULL CHECK (CHAR_LENGTH(BTRIM(request_id)) BETWEEN 8 AND 160),
  request_fingerprint TEXT NOT NULL CHECK (CHAR_LENGTH(BTRIM(request_fingerprint)) BETWEEN 16 AND 160),
  ad_id TEXT NOT NULL REFERENCES ad_listings(id) ON DELETE RESTRICT,
  result_revision BIGINT NOT NULL CHECK (result_revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(owner_user_id, action, request_id)
);

CREATE TABLE ad_moderation_events (
  id TEXT PRIMARY KEY,
  ad_id TEXT NOT NULL REFERENCES ad_listings(id) ON DELETE RESTRICT,
  reviewer_user_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE RESTRICT,
  review_revision BIGINT NOT NULL CHECK (review_revision > 0),
  content_revision BIGINT NOT NULL CHECK (content_revision > 0),
  decision TEXT NOT NULL CHECK (decision IN ('approved','rejected')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ad_moderation_reason_contract CHECK (
    (decision='rejected' AND reason IS NOT NULL AND CHAR_LENGTH(BTRIM(reason)) >= 2)
    OR (decision='approved' AND reason IS NULL)
  ),
  CONSTRAINT ad_moderation_revision_unique UNIQUE(ad_id, review_revision)
);

CREATE FUNCTION enforce_ad_free_slot_limit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('ad-free-slot:' || NEW.owner_user_id, 0));
  IF (SELECT count(*) FROM ad_free_slots WHERE owner_user_id=NEW.owner_user_id) >= 3 THEN
    RAISE EXCEPTION 'AD_FREE_QUOTA_EXHAUSTED' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ad_free_slot_limit_before_insert
BEFORE INSERT ON ad_free_slots FOR EACH ROW EXECUTE FUNCTION enforce_ad_free_slot_limit();

CREATE FUNCTION protect_ad_listing_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.owner_user_id <> OLD.owner_user_id THEN
    RAISE EXCEPTION 'AD_IDENTITY_IMMUTABLE' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ad_listing_identity_before_update
BEFORE UPDATE ON ad_listings FOR EACH ROW EXECUTE FUNCTION protect_ad_listing_identity();

CREATE FUNCTION reject_ad_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AD_AUDIT_APPEND_ONLY' USING ERRCODE='55000';
END $$;
CREATE TRIGGER ad_free_slots_append_only BEFORE UPDATE OR DELETE ON ad_free_slots
FOR EACH ROW EXECUTE FUNCTION reject_ad_audit_mutation();
CREATE TRIGGER ad_request_receipts_append_only BEFORE UPDATE OR DELETE ON ad_request_receipts
FOR EACH ROW EXECUTE FUNCTION reject_ad_audit_mutation();
CREATE TRIGGER ad_moderation_events_append_only BEFORE UPDATE OR DELETE ON ad_moderation_events
FOR EACH ROW EXECUTE FUNCTION reject_ad_audit_mutation();

ALTER TABLE media_assets
  DROP CONSTRAINT media_assets_owner_type_check,
  ADD CONSTRAINT media_assets_owner_type_check
    CHECK (owner_type IN ('business_profile','professional_profile','product_listing','ad_listing','user')),
  DROP CONSTRAINT media_assets_asset_type_check,
  ADD CONSTRAINT media_assets_asset_type_check
    CHECK (asset_type IN ('logo','cover','gallery','profile_image','service_image','product_image','ad_image'));
