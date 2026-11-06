/**
 * Server-only exact evidence fingerprint for professional content review.
 * The same SQL runs at read time and inside the approval transaction.
 * Never accept a fingerprint claimed by a browser as proof of policy review.
 */
export const PROFESSIONAL_REVIEW_EVIDENCE_EXPRESSION = `encode(sha256(convert_to(jsonb_build_object(
  'profile', jsonb_build_array(
    p.professional_profile_identifier, p.user_identifier, p.lifecycle_status,
    p.moderation_status, p.visibility, p.headline_ar, p.headline_en,
    p.bio_ar, p.bio_en, p.availability, p.city_code, p.country_code,
    p.skills, p.updated_at
  ),
  'media', COALESCE((
    SELECT jsonb_agg(jsonb_build_array(
      m.id, m.owner_user_id, m.asset_type, m.visibility,
      m.storage_key, m.public_url, m.sort_order,
      m.mime_type, m.size_bytes, m.created_at, m.updated_at
    ) ORDER BY m.id)
    FROM media_assets m
    WHERE m.owner_type='professional_profile'
      AND m.owner_id=p.professional_profile_identifier
  ), '[]'::jsonb),
  'services', COALESCE((
    SELECT jsonb_agg(jsonb_build_array(
      sl.id, sl.owner_type, sl.owner_id, sl.title_ar, sl.title_en,
      sl.description_ar, sl.description_en, sl.category_code,
      sl.price, sl.price_currency, sl.price_type, sl.status,
      sl.is_featured, sl.created_at, sl.updated_at
    ) ORDER BY sl.id)
    FROM service_listings sl
    WHERE sl.owner_type='professional'
      AND sl.owner_id=p.professional_profile_identifier
  ), '[]'::jsonb)
)::text, 'UTF8')), 'hex')`;

export const PROFESSIONAL_REVIEW_EVIDENCE_SQL = `
  SELECT ${PROFESSIONAL_REVIEW_EVIDENCE_EXPRESSION} AS evidence_fingerprint
  FROM professional_profiles p
  WHERE p.professional_profile_identifier=$1 LIMIT 1
`;
