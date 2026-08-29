-- Restore every pre-existing category row exactly as migration 022 found it.
-- Rows introduced by 022 are preserved because they may already be referenced.
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
