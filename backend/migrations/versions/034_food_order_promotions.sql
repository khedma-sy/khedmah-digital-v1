-- Restaurant-funded basket promotions for cash food orders.
-- Promotion discounts apply only to the item subtotal; delivery fees remain undiscounted.
BEGIN;

CREATE TABLE food_promo_codes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL
    CHECK (code = UPPER(code) AND code ~ '^[A-Z0-9_-]{4,32}$'),
  name_ar TEXT NOT NULL CHECK (CHAR_LENGTH(BTRIM(name_ar)) BETWEEN 2 AND 100),
  merchant_business_id TEXT NOT NULL REFERENCES business_profiles(id) ON DELETE RESTRICT,
  created_by_user_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE RESTRICT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage','fixed')),
  percentage_off SMALLINT CHECK (percentage_off BETWEEN 1 AND 90),
  fixed_amount NUMERIC(14,2) CHECK (fixed_amount > 0),
  currency TEXT NOT NULL CHECK (currency IN ('SYP','USD')),
  minimum_subtotal NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (minimum_subtotal >= 0),
  maximum_discount NUMERIC(14,2) CHECK (maximum_discount > 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  valid_from TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ NOT NULL CHECK (valid_until > valid_from),
  max_redemptions INTEGER CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  per_user_limit INTEGER NOT NULL DEFAULT 1 CHECK (per_user_limit BETWEEN 1 AND 20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT food_promo_merchant_code_unique UNIQUE (merchant_business_id, code),
  CONSTRAINT food_promo_limits_check CHECK (
    max_redemptions IS NULL OR max_redemptions >= per_user_limit
  ),
  CONSTRAINT food_promo_discount_shape_check CHECK (
    (discount_type = 'percentage' AND percentage_off IS NOT NULL AND fixed_amount IS NULL)
    OR
    (discount_type = 'fixed' AND percentage_off IS NULL AND fixed_amount IS NOT NULL
      AND fixed_amount < minimum_subtotal AND maximum_discount IS NULL)
  )
);

CREATE INDEX food_promo_merchant_created_idx
  ON food_promo_codes(merchant_business_id, created_at DESC);
CREATE INDEX food_promo_active_window_idx
  ON food_promo_codes(active, valid_from, valid_until);

ALTER TABLE fulfillment_orders
  ADD COLUMN food_promo_id TEXT REFERENCES food_promo_codes(id) ON DELETE RESTRICT,
  ADD COLUMN promo_code TEXT,
  ADD COLUMN discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  DROP CONSTRAINT fulfillment_orders_total_contract,
  ADD CONSTRAINT fulfillment_orders_discount_amount_check
    CHECK (discount_amount >= 0 AND discount_amount < subtotal),
  ADD CONSTRAINT fulfillment_orders_promo_snapshot_check CHECK (
    (food_promo_id IS NULL AND promo_code IS NULL AND discount_amount = 0)
    OR
    (food_promo_id IS NOT NULL AND promo_code IS NOT NULL AND discount_amount > 0
      AND promo_code = UPPER(promo_code) AND promo_code ~ '^[A-Z0-9_-]{4,32}$')
  ),
  ADD CONSTRAINT fulfillment_orders_total_contract CHECK (
    (delivery_fee IS NULL AND total IS NULL)
    OR total = subtotal - discount_amount + delivery_fee
  );

CREATE TABLE food_promo_claims (
  id TEXT PRIMARY KEY,
  promo_id TEXT NOT NULL REFERENCES food_promo_codes(id) ON DELETE RESTRICT,
  order_id TEXT NOT NULL UNIQUE REFERENCES fulfillment_orders(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE RESTRICT,
  merchant_business_id TEXT NOT NULL REFERENCES business_profiles(id) ON DELETE RESTRICT,
  code_snapshot TEXT NOT NULL CHECK (code_snapshot = UPPER(code_snapshot) AND code_snapshot ~ '^[A-Z0-9_-]{4,32}$'),
  subtotal_snapshot NUMERIC(14,2) NOT NULL CHECK (subtotal_snapshot > 0),
  discount_amount NUMERIC(14,2) NOT NULL CHECK (discount_amount > 0 AND discount_amount < subtotal_snapshot),
  currency TEXT NOT NULL CHECK (currency IN ('SYP','USD')),
  status TEXT NOT NULL DEFAULT 'applied' CHECK (status IN ('applied','redeemed','released')),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  redeemed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  CONSTRAINT food_promo_claim_lifecycle_check CHECK (
    (status = 'applied' AND redeemed_at IS NULL AND released_at IS NULL)
    OR (status = 'redeemed' AND redeemed_at IS NOT NULL AND released_at IS NULL)
    OR (status = 'released' AND redeemed_at IS NULL AND released_at IS NOT NULL)
  )
);

CREATE INDEX food_promo_claim_limit_idx
  ON food_promo_claims(promo_id, status);
CREATE INDEX food_promo_claim_user_limit_idx
  ON food_promo_claims(promo_id, user_id, status);

COMMIT;
