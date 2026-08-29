-- Preserve category rows that may already be referenced, while removing the
-- hierarchy/search presentation columns introduced by migration 022.
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
