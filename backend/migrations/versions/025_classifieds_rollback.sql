-- Remove only media introduced for independent classifieds before restoring the 024 media contract.
DELETE FROM media_assets WHERE owner_type='ad_listing' OR asset_type='ad_image';

ALTER TABLE media_assets
  DROP CONSTRAINT media_assets_owner_type_check,
  ADD CONSTRAINT media_assets_owner_type_check
    CHECK (owner_type IN ('business_profile','professional_profile','product_listing','user')),
  DROP CONSTRAINT media_assets_asset_type_check,
  ADD CONSTRAINT media_assets_asset_type_check
    CHECK (asset_type IN ('logo','cover','gallery','profile_image','service_image','product_image'));

DROP TRIGGER IF EXISTS ad_moderation_events_append_only ON ad_moderation_events;
DROP TRIGGER IF EXISTS ad_request_receipts_append_only ON ad_request_receipts;
DROP TRIGGER IF EXISTS ad_free_slots_append_only ON ad_free_slots;
DROP TRIGGER IF EXISTS ad_listing_identity_before_update ON ad_listings;
DROP TRIGGER IF EXISTS ad_free_slot_limit_before_insert ON ad_free_slots;
DROP FUNCTION IF EXISTS reject_ad_audit_mutation();
DROP FUNCTION IF EXISTS protect_ad_listing_identity();
DROP FUNCTION IF EXISTS enforce_ad_free_slot_limit();
DROP TABLE IF EXISTS ad_moderation_events;
DROP TABLE IF EXISTS ad_request_receipts;
DROP TABLE IF EXISTS ad_free_slots;
DROP TABLE IF EXISTS ad_listings;
