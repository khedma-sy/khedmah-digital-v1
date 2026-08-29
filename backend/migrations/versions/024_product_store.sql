-- Product discovery store: listing and moderation only. No cart, ordering or payments.
CREATE TABLE product_listings (
  id TEXT PRIMARY KEY,
  business_profile_id TEXT NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE RESTRICT,
  title_ar TEXT NOT NULL CHECK (CHAR_LENGTH(BTRIM(title_ar)) BETWEEN 2 AND 160),
  description_ar TEXT CHECK (description_ar IS NULL OR CHAR_LENGTH(description_ar) <= 2000),
  price NUMERIC(14,2) NOT NULL CHECK (price > 0),
  currency TEXT NOT NULL DEFAULT 'SYP' CHECK (currency IN ('SYP','USD')),
  category_code TEXT NOT NULL REFERENCES categories(code) ON UPDATE CASCADE,
  availability TEXT NOT NULL DEFAULT 'in_stock' CHECK (availability IN ('in_stock','out_of_stock','made_to_order')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','inactive')),
  moderation_status TEXT NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending','approved','rejected')),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX product_listings_owner_created_idx ON product_listings(owner_user_id, created_at DESC);
CREATE INDEX product_listings_business_created_idx ON product_listings(business_profile_id, created_at DESC);
CREATE INDEX product_listings_public_idx ON product_listings(category_code, created_at DESC)
  WHERE status = 'active' AND moderation_status = 'approved';

ALTER TABLE media_assets
  DROP CONSTRAINT media_assets_owner_type_check,
  ADD CONSTRAINT media_assets_owner_type_check
    CHECK (owner_type IN ('business_profile', 'professional_profile', 'product_listing', 'user')),
  DROP CONSTRAINT media_assets_asset_type_check,
  ADD CONSTRAINT media_assets_asset_type_check
    CHECK (asset_type IN ('logo','cover','gallery','profile_image','service_image','product_image'));
