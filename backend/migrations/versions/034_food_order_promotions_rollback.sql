-- Remove restaurant-funded food promotions only when no promotion data exists.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM food_promo_codes)
    OR EXISTS (SELECT 1 FROM food_promo_claims)
    OR EXISTS (SELECT 1 FROM fulfillment_orders WHERE food_promo_id IS NOT NULL OR discount_amount <> 0)
  THEN
    RAISE EXCEPTION 'MIGRATION_034_ROLLBACK_BLOCKED: food promotion data exists' USING ERRCODE = '55000';
  END IF;
END $$;

DROP TABLE food_promo_claims;

ALTER TABLE fulfillment_orders
  DROP CONSTRAINT fulfillment_orders_total_contract,
  DROP CONSTRAINT fulfillment_orders_promo_snapshot_check,
  DROP CONSTRAINT fulfillment_orders_discount_amount_check,
  DROP COLUMN discount_amount,
  DROP COLUMN promo_code,
  DROP COLUMN food_promo_id,
  ADD CONSTRAINT fulfillment_orders_total_contract CHECK (
    (delivery_fee IS NULL AND total IS NULL)
    OR total = subtotal + delivery_fee
  );

DROP TABLE food_promo_codes;

COMMIT;
