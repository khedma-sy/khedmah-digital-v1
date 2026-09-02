-- Khedmah offers and discounts: stable business QR, governed campaigns, and one-time redemption receipts.
CREATE TABLE promotion_business_codes (
  business_profile_id TEXT PRIMARY KEY REFERENCES business_profiles(id) ON DELETE CASCADE,
  static_code TEXT NOT NULL UNIQUE CHECK (static_code ~ '^KHD-[A-F0-9]{12}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE promotions (
  id TEXT PRIMARY KEY,
  business_profile_id TEXT NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE RESTRICT,
  title_ar TEXT NOT NULL CHECK (CHAR_LENGTH(BTRIM(title_ar)) BETWEEN 4 AND 120),
  description_ar TEXT NOT NULL CHECK (CHAR_LENGTH(BTRIM(description_ar)) BETWEEN 10 AND 1000),
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage','fixed_amount')),
  original_price NUMERIC(14,2) NOT NULL CHECK (original_price > 0),
  discount_value NUMERIC(14,2) NOT NULL CHECK (discount_value > 0),
  currency TEXT NOT NULL DEFAULT 'SYP' CHECK (currency IN ('SYP','USD')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  total_limit INTEGER NOT NULL CHECK (total_limit BETWEEN 1 AND 100000),
  per_user_limit SMALLINT NOT NULL DEFAULT 1 CHECK (per_user_limit BETWEEN 1 AND 5),
  redeemed_count INTEGER NOT NULL DEFAULT 0 CHECK (redeemed_count >= 0 AND redeemed_count <= total_limit),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  moderation_status TEXT NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending','approved','rejected')),
  moderation_policy_version TEXT,
  rejection_reason TEXT CHECK (rejection_reason IS NULL OR CHAR_LENGTH(rejection_reason) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT promotions_period_check CHECK (ends_at > starts_at),
  CONSTRAINT promotions_discount_check CHECK (
    (discount_type='percentage' AND discount_value BETWEEN 1 AND 90)
    OR (discount_type='fixed_amount' AND discount_value < original_price)
  )
);

CREATE TABLE promotion_claims (
  id TEXT PRIMARY KEY,
  promotion_id TEXT NOT NULL REFERENCES promotions(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE RESTRICT,
  redemption_code TEXT NOT NULL UNIQUE CHECK (redemption_code ~ '^[A-Z2-9]{10}$'),
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','redeemed','expired','cancelled')),
  expires_at TIMESTAMPTZ NOT NULL,
  redeemed_at TIMESTAMPTZ,
  redeemed_by_user_id TEXT REFERENCES core_user_accounts(user_identifier) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT promotion_claims_redeemed_shape CHECK ((status='redeemed')=(redeemed_at IS NOT NULL))
);

CREATE TABLE promotion_events (
  id TEXT PRIMARY KEY,
  promotion_id TEXT NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  claim_id TEXT REFERENCES promotion_claims(id) ON DELETE SET NULL,
  actor_user_id TEXT REFERENCES core_user_accounts(user_identifier) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN ('created','auto_approved','reviewed','claimed','redeemed','deactivated')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX promotions_public_active_idx ON promotions(starts_at, ends_at, created_at DESC)
  WHERE status='active' AND moderation_status='approved';
CREATE INDEX promotions_business_created_idx ON promotions(business_profile_id, created_at DESC);
CREATE INDEX promotion_claims_user_created_idx ON promotion_claims(user_id, created_at DESC);
CREATE INDEX promotion_claims_promotion_user_idx ON promotion_claims(promotion_id, user_id, created_at DESC);
CREATE INDEX promotion_events_promotion_created_idx ON promotion_events(promotion_id, created_at DESC);
