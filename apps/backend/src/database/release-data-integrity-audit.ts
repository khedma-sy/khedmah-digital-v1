import type { DatabasePool } from './database.pool';

export type ReleaseDataIntegrityCode =
  | 'ORPHAN_VERIFICATION_TARGET'
  | 'MULTIPLE_PENDING_VERIFICATION'
  | 'VERIFICATION_DECISION_METADATA_MISMATCH'
  | 'PENDING_VERIFICATION_REQUESTER_MISMATCH'
  | 'ORPHAN_MEDIA_OWNER'
  | 'MEDIA_OWNER_USER_MISMATCH'
  | 'DUPLICATE_MEDIA_STORAGE_KEY'
  | 'ORPHAN_SERVICE_OWNER';

export interface ReleaseDataIntegrityFinding {
  readonly code: ReleaseDataIntegrityCode;
  readonly count: number;
  readonly sampleIds: readonly string[];
}

export interface ReleaseDataIntegrityReport {
  readonly ok: boolean;
  readonly checkedAt: string;
  readonly findings: readonly ReleaseDataIntegrityFinding[];
}

type FindingRow = { id: string; total: number | string };

/**
 * Read-only release audit for historical states that current runtime contracts prevent.
 * It intentionally does not repair, delete, or reclassify any row. A non-empty report is
 * evidence for an explicitly reviewed cleanup plan after a backup, never permission to mutate.
 */
export async function auditReleaseDataIntegrity(db: DatabasePool): Promise<ReleaseDataIntegrityReport> {
  const findings: ReleaseDataIntegrityFinding[] = [];

  const collect = async (code: ReleaseDataIntegrityCode, body: string): Promise<void> => {
    const rows = await db.query<FindingRow>(
      `SELECT id, count(*) OVER()::int AS total
       FROM (${body}) release_integrity_findings
       ORDER BY id
       LIMIT 20`
    );
    if (!rows.length) return;
    findings.push({
      code,
      count: Number(rows[0].total),
      sampleIds: rows.map((row) => row.id)
    });
  };

  await collect('ORPHAN_VERIFICATION_TARGET', `
    SELECT vr.id
    FROM verification_requests vr
    LEFT JOIN business_profiles b
      ON vr.entity_type='business' AND b.id=vr.entity_id
    LEFT JOIN professional_profiles p
      ON vr.entity_type='professional' AND p.professional_profile_identifier=vr.entity_id
    WHERE (vr.entity_type='business' AND b.id IS NULL)
       OR (vr.entity_type='professional' AND p.professional_profile_identifier IS NULL)
  `);

  await collect('MULTIPLE_PENDING_VERIFICATION', `
    SELECT entity_type || ':' || entity_id AS id
    FROM verification_requests
    WHERE status='pending'
    GROUP BY entity_type,entity_id
    HAVING count(*) > 1
  `);

  await collect('VERIFICATION_DECISION_METADATA_MISMATCH', `
    SELECT id
    FROM verification_requests
    WHERE (status='pending' AND (reviewed_by IS NOT NULL OR reviewed_at IS NOT NULL))
       OR (status IN ('approved','rejected') AND (reviewed_by IS NULL OR reviewed_at IS NULL))
  `);

  await collect('PENDING_VERIFICATION_REQUESTER_MISMATCH', `
    SELECT vr.id
    FROM verification_requests vr
    LEFT JOIN business_profiles b
      ON vr.entity_type='business' AND b.id=vr.entity_id
    LEFT JOIN professional_profiles p
      ON vr.entity_type='professional' AND p.professional_profile_identifier=vr.entity_id
    WHERE vr.status='pending'
      AND ((vr.entity_type='business' AND b.id IS NOT NULL AND vr.requester_id<>b.owner_user_id)
        OR (vr.entity_type='professional' AND p.professional_profile_identifier IS NOT NULL AND vr.requester_id<>p.user_identifier))
  `);

  const tableRows = await db.query<{ product_listings: string | null }>(
    `SELECT to_regclass('public.product_listings')::text AS product_listings`
  );
  const hasProducts = tableRows[0]?.product_listings !== null;
  const productOwnerMissing = hasProducts
    ? `(ma.owner_type='product_listing' AND NOT EXISTS (SELECT 1 FROM product_listings pl WHERE pl.id=ma.owner_id)) OR`
    : `(ma.owner_type='product_listing') OR`;
  const productOwnerMismatch = hasProducts
    ? `OR (ma.owner_type='product_listing' AND EXISTS (
          SELECT 1 FROM product_listings pl WHERE pl.id=ma.owner_id AND pl.owner_user_id<>ma.owner_user_id
        ))`
    : '';

  await collect('ORPHAN_MEDIA_OWNER', `
    SELECT ma.id
    FROM media_assets ma
    WHERE (ma.owner_type='business_profile' AND NOT EXISTS (SELECT 1 FROM business_profiles b WHERE b.id=ma.owner_id))
       OR (ma.owner_type='professional_profile' AND NOT EXISTS (
            SELECT 1 FROM professional_profiles p WHERE p.professional_profile_identifier=ma.owner_id
          ))
       OR ${productOwnerMissing}
          (ma.owner_type='user' AND NOT EXISTS (SELECT 1 FROM core_user_accounts u WHERE u.user_identifier=ma.owner_id))
  `);

  await collect('MEDIA_OWNER_USER_MISMATCH', `
    SELECT ma.id
    FROM media_assets ma
    WHERE (ma.owner_type='business_profile' AND EXISTS (
            SELECT 1 FROM business_profiles b WHERE b.id=ma.owner_id AND b.owner_user_id<>ma.owner_user_id
          ))
       OR (ma.owner_type='professional_profile' AND EXISTS (
            SELECT 1 FROM professional_profiles p
            WHERE p.professional_profile_identifier=ma.owner_id AND p.user_identifier<>ma.owner_user_id
          ))
       ${productOwnerMismatch}
       OR (ma.owner_type='user' AND ma.owner_id<>ma.owner_user_id)
  `);

  await collect('DUPLICATE_MEDIA_STORAGE_KEY', `
    SELECT storage_key AS id
    FROM media_assets
    GROUP BY storage_key
    HAVING count(*) > 1
  `);

  await collect('ORPHAN_SERVICE_OWNER', `
    SELECT sl.id
    FROM service_listings sl
    WHERE (sl.owner_type='business' AND NOT EXISTS (SELECT 1 FROM business_profiles b WHERE b.id=sl.owner_id))
       OR (sl.owner_type='professional' AND NOT EXISTS (
            SELECT 1 FROM professional_profiles p WHERE p.professional_profile_identifier=sl.owner_id
          ))
  `);

  return {
    ok: findings.length === 0,
    checkedAt: new Date().toISOString(),
    findings
  };
}
