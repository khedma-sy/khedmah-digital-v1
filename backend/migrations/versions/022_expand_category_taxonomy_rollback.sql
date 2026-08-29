-- Refuse rollback before changing data when a category created after the
-- pre-022 snapshot is already referenced. The older schema cannot represent
-- that relationship safely, so an operator must remap those references first.
DO $rollback_guard$
BEGIN
  IF to_regclass(current_schema() || '.category_taxonomy_022_before_image') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_022_ROLLBACK_BEFORE_IMAGE_MISSING';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM business_profiles AS profile
    JOIN categories AS category ON category.code = profile.category_code
    WHERE NOT EXISTS (
      SELECT 1
      FROM category_taxonomy_022_before_image AS before_image
      WHERE before_image.code = category.code
    )
  ) OR EXISTS (
    SELECT 1
    FROM service_listings AS service
    JOIN categories AS category ON category.code = service.category_code
    WHERE NOT EXISTS (
      SELECT 1
      FROM category_taxonomy_022_before_image AS before_image
      WHERE before_image.code = category.code
    )
  ) THEN
    RAISE EXCEPTION 'MIGRATION_022_ROLLBACK_NEW_CATEGORY_REFERENCED';
  END IF;
END
$rollback_guard$;

-- Restore every pre-existing category row exactly as migration 022 found it.
UPDATE categories AS category
SET
  name_ar = before_image.name_ar,
  name_en = before_image.name_en,
  status = before_image.status,
  sort_order = before_image.sort_order,
  created_at = before_image.created_at,
  updated_at = before_image.updated_at
FROM category_taxonomy_022_before_image AS before_image
WHERE category.code = before_image.code;

-- Remove every unreferenced row created after the snapshot so the old
-- application receives the exact pre-022 flat catalog. Clear the hierarchy on
-- all rows first so the self-referencing foreign key cannot make deletion
-- order-dependent. Any unmodelled reference still fails through its database
-- foreign key and leaves the surrounding rollback transaction unchanged.
UPDATE categories
SET parent_code = NULL
WHERE parent_code IS NOT NULL;

DELETE FROM categories AS category
WHERE NOT EXISTS (
  SELECT 1
  FROM category_taxonomy_022_before_image AS before_image
  WHERE before_image.code = category.code
);

-- Remove only the hierarchy/search presentation columns introduced by 022.
ALTER TABLE categories
  DROP CONSTRAINT IF EXISTS categories_parent_code_fk,
  DROP CONSTRAINT IF EXISTS categories_parent_not_self_check,
  DROP CONSTRAINT IF EXISTS categories_visual_key_format_check;

DROP INDEX IF EXISTS categories_parent_public_order_idx;

ALTER TABLE categories
  DROP COLUMN IF EXISTS parent_code,
  DROP COLUMN IF EXISTS visual_key,
  DROP COLUMN IF EXISTS search_aliases_ar,
  DROP COLUMN IF EXISTS search_aliases_en,
  DROP COLUMN IF EXISTS is_featured;

DROP TABLE category_taxonomy_022_before_image;
