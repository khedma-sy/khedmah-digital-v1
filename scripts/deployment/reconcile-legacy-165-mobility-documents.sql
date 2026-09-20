-- One-time, non-production compatibility bridge from the exact PR #165
-- mobility document review schema (historical migration 033) to the
-- canonical recovery contract (migration 027).
--
-- This file is NOT a canonical migration and must only be invoked by
-- run-fulfillment-nonproduction-migrations.sh after an exact legacy fingerprint.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('khedmah-nonproduction-fulfillment-026-028', 0));

DO $legacy_guard$
DECLARE
  review_columns integer;
  event_columns integer;
BEGIN
  -- Re-check the exact historical shape while holding the migration lock.
  SELECT count(*)::int INTO review_columns
  FROM information_schema.columns
  WHERE table_schema=current_schema()
    AND table_name='mobility_document_reviews';

  SELECT count(*)::int INTO event_columns
  FROM information_schema.columns
  WHERE table_schema=current_schema()
    AND table_name='mobility_document_review_events';

  IF to_regclass(current_schema() || '.mobility_document_reviews') IS NULL
     OR to_regclass(current_schema() || '.mobility_document_review_events') IS NULL
     OR review_columns <> 9
     OR event_columns <> 8
     OR NOT EXISTS (
       SELECT 1 FROM pg_constraint c
       JOIN pg_class t ON t.oid=c.conrelid
       JOIN pg_namespace n ON n.oid=t.relnamespace
       WHERE n.nspname=current_schema()
         AND t.relname='mobility_document_reviews'
         AND c.conname='mobility_document_reviews_business_type_unique'
         AND c.contype='u'
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_constraint c
       JOIN pg_class t ON t.oid=c.conrelid
       JOIN pg_namespace n ON n.oid=t.relnamespace
       WHERE n.nspname=current_schema()
         AND t.relname='mobility_document_review_events'
         AND c.conname='mobility_document_review_events_reason_check'
         AND c.contype='c'
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_indexes
       WHERE schemaname=current_schema()
         AND indexname='mobility_document_reviews_business_status_idx'
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_indexes
       WHERE schemaname=current_schema()
         AND indexname='mobility_document_review_events_business_created_idx'
     )
     OR EXISTS (
       SELECT 1 FROM pg_indexes
       WHERE schemaname=current_schema()
         AND indexname IN (
           'mobility_document_reviews_business_idx',
           'mobility_document_review_events_business_idx'
         )
     )
     OR to_regprocedure(current_schema() || '.create_pending_mobility_document_review()') IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM pg_trigger t
       JOIN pg_class c ON c.oid=t.tgrelid
       JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname=current_schema()
         AND NOT t.tgisinternal
         AND t.tgname='media_assets_pending_mobility_document_review'
     )
     OR EXISTS (
       SELECT 1 FROM pg_constraint c
       JOIN pg_class t ON t.oid=c.conrelid
       JOIN pg_namespace n ON n.oid=t.relnamespace
       WHERE n.nspname=current_schema()
         AND t.relname='media_assets'
         AND c.conname='media_assets_driver_documents_private_check'
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_constraint c
       JOIN pg_class t ON t.oid=c.conrelid
       JOIN pg_namespace n ON n.oid=t.relnamespace
       WHERE n.nspname=current_schema()
         AND t.relname='media_assets'
         AND c.conname='media_assets_asset_type_check'
         AND pg_get_constraintdef(c.oid) LIKE '%ad_image%'
         AND pg_get_constraintdef(c.oid) NOT LIKE '%driver_photo%'
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_constraint c
       JOIN pg_class t ON t.oid=c.conrelid
       JOIN pg_namespace n ON n.oid=t.relnamespace
       WHERE n.nspname=current_schema()
         AND t.relname='mobility_document_review_events'
         AND c.conname='mobility_document_review_events_actor_user_id_fkey'
         AND c.contype='f'
         AND c.confdeltype='n'
     )
     OR EXISTS (
       SELECT 1 FROM pg_constraint c
       JOIN pg_class t ON t.oid=c.conrelid
       JOIN pg_namespace n ON n.oid=t.relnamespace
       WHERE n.nspname=current_schema()
         AND t.relname='mobility_document_review_events'
         AND c.conname='mobility_document_review_events_media_asset_id_fkey'
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_attribute a
       JOIN pg_class t ON t.oid=a.attrelid
       JOIN pg_namespace n ON n.oid=t.relnamespace
       WHERE n.nspname=current_schema()
         AND t.relname='mobility_document_review_events'
         AND a.attname='actor_user_id'
         AND a.attnum > 0
         AND NOT a.attisdropped
         AND NOT a.attnotnull
     )
  THEN
    RAISE EXCEPTION 'LEGACY_165_MOBILITY_DOCUMENT_FINGERPRINT_MISMATCH';
  END IF;

  -- The canonical 027 constraints must be satisfiable without rewriting data.
  IF EXISTS (
    SELECT 1 FROM mobility_document_reviews
    WHERE review_reason IS NOT NULL AND char_length(review_reason) > 500
  ) THEN
    RAISE EXCEPTION 'LEGACY_165_REVIEW_REASON_TOO_LONG';
  END IF;

  IF EXISTS (
    SELECT 1 FROM mobility_document_review_events
    WHERE actor_user_id IS NULL
  ) THEN
    RAISE EXCEPTION 'LEGACY_165_EVENT_ACTOR_MISSING';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM mobility_document_review_events e
    LEFT JOIN media_assets m ON m.id=e.media_asset_id
    WHERE m.id IS NULL
  ) THEN
    RAISE EXCEPTION 'LEGACY_165_EVENT_MEDIA_MISSING';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM mobility_document_review_events e
    LEFT JOIN core_user_accounts u ON u.user_identifier=e.actor_user_id
    WHERE u.user_identifier IS NULL
  ) THEN
    RAISE EXCEPTION 'LEGACY_165_EVENT_ACTOR_UNKNOWN';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM mobility_document_reviews r
    JOIN media_assets m ON m.id=r.media_asset_id
    WHERE m.owner_type <> 'business_profile'
       OR m.owner_id <> r.business_profile_id
       OR m.visibility <> 'private'
       OR m.asset_type <> r.document_type
  ) THEN
    RAISE EXCEPTION 'LEGACY_165_REVIEW_MEDIA_MISMATCH';
  END IF;
END
$legacy_guard$;

ALTER TABLE media_assets
  DROP CONSTRAINT media_assets_asset_type_check,
  ADD CONSTRAINT media_assets_asset_type_check CHECK (asset_type IN (
    'logo','cover','gallery','profile_image','service_image','product_image','ad_image',
    'driver_photo','identity_card','driving_license','vehicle_license'
  ));

ALTER TABLE media_assets
  ADD CONSTRAINT media_assets_driver_documents_private_check CHECK (
    asset_type NOT IN ('driver_photo','identity_card','driving_license','vehicle_license')
    OR (owner_type = 'business_profile' AND visibility = 'private')
  );

ALTER TABLE mobility_document_reviews
  DROP CONSTRAINT mobility_document_reviews_business_type_unique,
  DROP CONSTRAINT mobility_document_reviews_decision_check,
  ADD CONSTRAINT mobility_document_reviews_review_reason_check
    CHECK (review_reason IS NULL OR CHAR_LENGTH(review_reason) <= 500),
  ADD CONSTRAINT mobility_document_reviews_decision_check CHECK (
    (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status = 'approved' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND review_reason IS NULL)
    OR (status = 'rejected' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND review_reason IS NOT NULL)
  );

DROP INDEX mobility_document_reviews_business_status_idx;
CREATE INDEX mobility_document_reviews_business_idx
  ON mobility_document_reviews(business_profile_id, document_type, status, updated_at DESC);

ALTER TABLE mobility_document_review_events
  DROP CONSTRAINT mobility_document_review_events_reason_check,
  DROP CONSTRAINT mobility_document_review_events_actor_user_id_fkey,
  ALTER COLUMN actor_user_id SET NOT NULL,
  ADD CONSTRAINT mobility_document_review_events_actor_user_id_fkey
    FOREIGN KEY (actor_user_id) REFERENCES core_user_accounts(user_identifier) ON DELETE RESTRICT,
  ADD CONSTRAINT mobility_document_review_events_media_asset_id_fkey
    FOREIGN KEY (media_asset_id) REFERENCES media_assets(id) ON DELETE CASCADE;

DROP INDEX mobility_document_review_events_business_created_idx;
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

COMMIT;
