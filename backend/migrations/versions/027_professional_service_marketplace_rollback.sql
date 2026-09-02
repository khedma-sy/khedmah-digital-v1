DELETE FROM media_assets WHERE owner_type = 'professional_request';
ALTER TABLE media_assets DROP CONSTRAINT media_assets_owner_type_check,
  ADD CONSTRAINT media_assets_owner_type_check CHECK (owner_type IN ('business_profile','professional_profile','product_listing','user')),
  DROP CONSTRAINT media_assets_asset_type_check,
  ADD CONSTRAINT media_assets_asset_type_check CHECK (asset_type IN ('logo','cover','gallery','profile_image','service_image','product_image'));
DROP TABLE IF EXISTS professional_service_ratings;
DROP TABLE IF EXISTS professional_service_warranties;
DROP TABLE IF EXISTS professional_service_events;
ALTER TABLE professional_service_requests DROP CONSTRAINT IF EXISTS professional_service_requests_accepted_offer_fkey;
DROP TABLE IF EXISTS professional_service_offers;
DROP TABLE IF EXISTS professional_service_requests;
