-- Read-only provider-discovery visibility triage for the owner-authorized Cloud SQL session.
-- Not an approval workflow, not a migration, and not proof that source is serving traffic.
-- Execute only via a reviewed READ-ONLY database connection, e.g.:
--   psql -X -v ON_ERROR_STOP=1 -f scripts/diagnostics/provider-visibility-readonly.sql
-- Requires Cloud SQL provenance and a separately authorized, audited read-only session.
-- NO ROW LEVEL DETAIL: no account identifiers, names, phones, contacts, coordinates or city cells.
-- A zero public-result count is NOT evidence that there are zero registered profiles.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY;
SET LOCAL statement_timeout = '10s';
SET LOCAL lock_timeout = '1s';
SET LOCAL search_path = pg_catalog;

DO $gate$
BEGIN
  IF pg_catalog.current_database() <> 'khedmah'
     OR pg_catalog.current_setting('transaction_read_only') <> 'on' THEN
    RAISE EXCEPTION 'STOP: PROVIDER_VISIBILITY_READ_ONLY_GATE_FAILED';
  END IF;
END
$gate$ LANGUAGE plpgsql;

-- Source contract:
-- business: BusinessProfileRepository.publicApprovedWhere (incl. demo-name exclusion)
-- professional: ProfessionalProfileRepository.listPublic
-- Only aggregated counters. Never return PII or individual locations.
WITH business AS (
  SELECT
    COUNT(*) AS registered_profiles,
    COUNT(*) FILTER (WHERE visibility = 'private') AS private_profiles,
    COUNT(*) FILTER (WHERE visibility = 'public') AS owner_public_intent,
    COUNT(*) FILTER (WHERE moderation_status = 'pending') AS moderation_pending,
    COUNT(*) FILTER (WHERE moderation_status = 'approved') AS moderation_approved,
    COUNT(*) FILTER (WHERE trust_status = 'pending') AS trust_pending,
    COUNT(*) FILTER (WHERE trust_status = 'approved') AS trust_approved,
    COUNT(*) FILTER (WHERE status <> 'active') AS not_active,
    COUNT(*) FILTER (WHERE visibility = 'public' AND moderation_status = 'approved'
      AND trust_status = 'approved' AND status = 'active'
      AND LOWER(BTRIM(name)) NOT IN ('khedmah production test', 'خدمة production test'))
      AS public_search_eligible,
    COUNT(*) FILTER (WHERE visibility = 'public' AND moderation_status = 'approved'
      AND trust_status = 'approved' AND status = 'active'
      AND LOWER(BTRIM(name)) NOT IN ('khedmah production test', 'خدمة production test')
      AND lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180)
      AS eligible_geolocated,
    COUNT(*) FILTER (WHERE visibility = 'public' AND moderation_status = 'approved'
      AND trust_status = 'approved' AND status = 'active'
      AND LOWER(BTRIM(name)) NOT IN ('khedmah production test', 'خدمة production test')
      AND (lat IS NULL OR lng IS NULL OR lat NOT BETWEEN -90 AND 90 OR lng NOT BETWEEN -180 AND 180))
      AS eligible_without_valid_map_point
  FROM public.business_profiles
), professional AS (
  SELECT
    COUNT(*) AS registered_profiles,
    COUNT(*) FILTER (WHERE visibility = 'private') AS private_profiles,
    COUNT(*) FILTER (WHERE visibility = 'internal') AS internal_profiles,
    COUNT(*) FILTER (WHERE visibility = 'public') AS owner_public_intent,
    COUNT(*) FILTER (WHERE moderation_status = 'pending') AS moderation_pending,
    COUNT(*) FILTER (WHERE moderation_status = 'approved') AS moderation_approved,
    COUNT(*) FILTER (WHERE lifecycle_status = 'created') AS not_submitted,
    COUNT(*) FILTER (WHERE lifecycle_status = 'pending') AS review_pending,
    COUNT(*) FILTER (WHERE lifecycle_status IN ('suspended','archived')) AS suspended_or_archived,
    COUNT(*) FILTER (WHERE visibility = 'public' AND moderation_status = 'approved'
      AND lifecycle_status = 'active') AS public_search_eligible
  FROM public.professional_profiles
)
SELECT 'business'::text AS profile_type, b.registered_profiles, b.private_profiles,
       0::bigint AS internal_profiles, b.owner_public_intent,
       b.moderation_pending, b.moderation_approved,
       b.trust_pending, b.trust_approved, b.not_active,
       0::bigint AS not_submitted, 0::bigint AS review_pending,
       0::bigint AS suspended_or_archived, b.public_search_eligible,
       b.eligible_geolocated, b.eligible_without_valid_map_point
FROM business b
UNION ALL
SELECT 'professional'::text, p.registered_profiles, p.private_profiles,
       p.internal_profiles, p.owner_public_intent,
       p.moderation_pending, p.moderation_approved,
       0::bigint, 0::bigint, 0::bigint,
       p.not_submitted, p.review_pending, p.suspended_or_archived,
       p.public_search_eligible, NULL::bigint, NULL::bigint
FROM professional p
ORDER BY profile_type;
ROLLBACK;
