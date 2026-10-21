import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { IdentityService } from '../identity/identity.service';
import { readSessionToken } from '../identity/session-cookie';
import { OperationsRbacService } from '../operations-product/operations-rbac.service';
import { PROFILE_REVISION_SQL } from './profile-review-write';

type VerificationEntityType = 'business' | 'professional';
type VerificationDecision = 'approved' | 'rejected';

export interface VerificationReviewItem {
  readonly requestId: string;
  readonly entityType: VerificationEntityType;
  readonly entityId: string;
  readonly label: string;
  readonly profileRevision: string;
  readonly createdAt: string;
  readonly evidence: readonly VerificationEvidenceItem[];
  readonly profileSummary: VerificationProfileSummary;
}

export type VerificationProfileSummary =
  | {
      readonly entityType: 'business'; readonly name: string; readonly descriptionAr?: string; readonly descriptionEn?: string;
      readonly categoryCode: string; readonly cityCode: string; readonly phone?: string; readonly email?: string;
      readonly website?: string; readonly addressAr?: string;
    }
  | {
      readonly entityType: 'professional'; readonly headlineAr: string; readonly headlineEn?: string; readonly bioAr?: string;
      readonly bioEn?: string; readonly skills: readonly string[]; readonly cityCode: string; readonly countryCode: string;
    };

export interface VerificationEvidenceItem {
  readonly id: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly createdAt: string;
  readonly secureUrl: string;
}

export interface VerificationReviewResult extends VerificationReviewItem {
  readonly status: VerificationDecision;
  readonly reviewedAt: string;
}

const REVISION_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const targets = {
  business: {
    table: 'business_profiles',
    id: 'id',
    projection: `name AS label, owner_user_id, trust_status, moderation_status, status, NULL::text AS lifecycle_status,
      jsonb_strip_nulls(jsonb_build_object(
        'entityType','business','name',name,'descriptionAr',description_ar,'descriptionEn',description_en,
        'categoryCode',category_code,'cityCode',city_code,'phone',phone,'email',email,'website',website,'addressAr',address_ar
      )) AS profile_summary`
  },
  professional: {
    table: 'professional_profiles',
    id: 'professional_profile_identifier',
    projection: `COALESCE(NULLIF(BTRIM(headline_ar),''), professional_profile_identifier) AS label, user_identifier AS owner_user_id,
      NULL::text AS trust_status, moderation_status, NULL::text AS status, lifecycle_status,
      jsonb_strip_nulls(jsonb_build_object(
        'entityType','professional','headlineAr',headline_ar,'headlineEn',headline_en,'bioAr',bio_ar,'bioEn',bio_en,
        'skills',skills,'cityCode',city_code,'countryCode',country_code
      )) AS profile_summary`
  }
} as const;

/**
 * Human-only verification review. The decision is bound to both the exact request and the
 * exact profile revision shown to the reviewer. Professional verification records the
 * reviewed request only; it never auto-approves moderation, lifecycle, identity, or publication.
 */
@Injectable()
export class VerificationReviewService {
  constructor(
    @Inject(DatabasePool) private readonly db: DatabasePool,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(OperationsRbacService) private readonly rbac: OperationsRbacService
  ) {}

  async listPending(cookieHeader: string | undefined): Promise<VerificationReviewItem[]> {
    await this.requireReviewer(cookieHeader, true);
    const rows = await this.db.query<{
      request_id: string;
      entity_type: VerificationEntityType;
      entity_id: string;
      label: string;
      profile_revision: string;
      request_created_at: Date;
      evidence: Array<{ id: string; filename: string; mimeType: string; sizeBytes: number; createdAt: string }>;
      profile_summary: VerificationProfileSummary;
    }>(`
      WITH latest AS (
        SELECT DISTINCT ON (entity_type, entity_id)
          id, entity_type, entity_id, status, created_at
        FROM verification_requests
        ORDER BY entity_type, entity_id, created_at DESC, id DESC
      )
      SELECT vr.id AS request_id, vr.entity_type, vr.entity_id, b.name AS label,
        to_char(b.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS profile_revision,
        vr.created_at AS request_created_at,
        jsonb_strip_nulls(jsonb_build_object(
          'entityType','business','name',b.name,'descriptionAr',b.description_ar,'descriptionEn',b.description_en,
          'categoryCode',b.category_code,'cityCode',b.city_code,'phone',b.phone,'email',b.email,
          'website',b.website,'addressAr',b.address_ar
        )) AS profile_summary,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id',m.id,'filename',m.filename,'mimeType',m.mime_type,'sizeBytes',m.size_bytes,
            'createdAt',to_char(m.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
          ) ORDER BY m.created_at,m.id)
          FROM (
            SELECT id,filename,mime_type,size_bytes,created_at FROM media_assets
            WHERE owner_type='business_profile' AND owner_id=b.id
              AND asset_type='business_verification_evidence' AND visibility='private'
            ORDER BY created_at,id LIMIT 4
          ) m
        ),'[]'::jsonb) AS evidence
      FROM latest vr
      JOIN business_profiles b ON vr.entity_type='business' AND b.id=vr.entity_id
      WHERE vr.status='pending'
      UNION ALL
      SELECT vr.id AS request_id, vr.entity_type, vr.entity_id,
        COALESCE(NULLIF(BTRIM(p.headline_ar),''), p.professional_profile_identifier) AS label,
        to_char(p.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS profile_revision,
        vr.created_at AS request_created_at,
        jsonb_strip_nulls(jsonb_build_object(
          'entityType','professional','headlineAr',p.headline_ar,'headlineEn',p.headline_en,
          'bioAr',p.bio_ar,'bioEn',p.bio_en,'skills',p.skills,'cityCode',p.city_code,'countryCode',p.country_code
        )) AS profile_summary,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id',m.id,'filename',m.filename,'mimeType',m.mime_type,'sizeBytes',m.size_bytes,
            'createdAt',to_char(m.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
          ) ORDER BY m.created_at,m.id)
          FROM (
            SELECT id,filename,mime_type,size_bytes,created_at FROM media_assets
            WHERE owner_type='professional_profile' AND owner_id=p.professional_profile_identifier
              AND asset_type='professional_verification_evidence' AND visibility='private'
            ORDER BY created_at,id LIMIT 4
          ) m
        ),'[]'::jsonb) AS evidence
      FROM latest vr
      JOIN professional_profiles p ON vr.entity_type='professional' AND p.professional_profile_identifier=vr.entity_id
      WHERE vr.status='pending'
      ORDER BY request_created_at ASC, request_id ASC
    `);
    return rows.map((row) => ({
      requestId: row.request_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      label: row.label,
      profileRevision: row.profile_revision,
      createdAt: row.request_created_at.toISOString(),
      profileSummary: row.profile_summary,
      evidence: (Array.isArray(row.evidence) ? row.evidence : []).map((item) => ({
        ...item,
        secureUrl: `/api/v1/media/public/${encodeURIComponent(item.id)}`
      }))
    }));
  }

  approve(cookieHeader: string | undefined, requestId: unknown, expectedRevision: unknown, notes: unknown) {
    return this.decide(cookieHeader, requestId, expectedRevision, 'approved', notes);
  }

  reject(cookieHeader: string | undefined, requestId: unknown, expectedRevision: unknown, notes: unknown) {
    return this.decide(cookieHeader, requestId, expectedRevision, 'rejected', notes);
  }

  private async decide(
    cookieHeader: string | undefined,
    requestIdValue: unknown,
    expectedRevision: unknown,
    decision: VerificationDecision,
    notesValue: unknown
  ): Promise<VerificationReviewResult> {
    const requestId = this.requireRequestId(requestIdValue);
    const revision = this.requireRevision(expectedRevision);
    const notes = this.requireNotes(notesValue);
    const actor = await this.requireReviewer(cookieHeader, decision === 'approved');

    return this.db.transaction(async (client) => {
      // Read immutable routing fields first. Parent-first locking below matches owner submission
      // lock order and avoids a request-vs-parent deadlock.
      const seed = await client.query<{ entity_type: string; entity_id: string }>(
        `SELECT entity_type,entity_id FROM verification_requests WHERE id=$1`,
        [requestId]
      );
      if (!seed.rows[0]) throw new NotFoundException('Verification request not found.');
      if (!['business', 'professional'].includes(seed.rows[0].entity_type)) {
        throw new ConflictException('Unsupported verification request type.');
      }
      const entityType = seed.rows[0].entity_type as VerificationEntityType;
      const entityId = seed.rows[0].entity_id;
      const target = targets[entityType];
      const parent = await client.query<{
        label: string;
        owner_user_id: string;
        trust_status: string | null;
        moderation_status: string;
        status: string | null;
        lifecycle_status: string | null;
        revision: string;
        profile_summary: VerificationProfileSummary;
      }>(
        `SELECT ${target.projection}, ${PROFILE_REVISION_SQL} AS revision
         FROM ${target.table} WHERE ${target.id}=$1 FOR UPDATE`,
        [entityId]
      );
      const current = parent.rows[0];
      if (!current) throw new ConflictException('The verification target no longer exists.');
      if (decision === 'approved' && current.owner_user_id === actor.id) {
        throw new ForbiddenException('A reviewer cannot approve their own verification request.');
      }

      const latest = await client.query<{ id: string; status: string; created_at: Date }>(
        `SELECT id,status,created_at FROM verification_requests
         WHERE entity_type=$1 AND entity_id=$2
         ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE`,
        [entityType, entityId]
      );
      if (!latest.rows[0] || latest.rows[0].id !== requestId) {
        throw new ConflictException('This verification request is no longer current. Reload the verification queue.');
      }
      if (latest.rows[0].status !== 'pending') {
        throw new ConflictException('This verification request has already been decided.');
      }
      if (current.revision !== revision) {
        throw new ConflictException('The profile changed. Reload the verification queue before deciding.');
      }
      const evidenceOwnerType = entityType === 'business' ? 'business_profile' : 'professional_profile';
      const evidenceAssetType = entityType === 'business' ? 'business_verification_evidence' : 'professional_verification_evidence';
      const evidence = await client.query<{
        id: string; filename: string; mime_type: string; size_bytes: number; created_at: Date;
      }>(
        `SELECT id,filename,mime_type,size_bytes,created_at FROM media_assets
         WHERE owner_type=$1 AND owner_id=$2 AND asset_type=$3 AND visibility='private'
         ORDER BY created_at,id LIMIT 4`,
        [evidenceOwnerType, entityId, evidenceAssetType]
      );
      if (decision === 'approved') {
        if (!evidence.rows[0]) {
          throw new ConflictException('Verification evidence is missing. Ask the owner to upload evidence and submit the request again.');
        }
        if (evidence.rows.length > 3) {
          throw new ConflictException('Verification evidence exceeds the three-image limit. Ask the owner to correct the evidence set.');
        }
      }
      if (entityType === 'business' && decision === 'approved' &&
          (current.trust_status === 'suspended' || current.status === 'suspended')) {
        throw new ConflictException('A suspended business requires an explicit trust decision before verification approval.');
      }

      const reviewed = await client.query<{ reviewed_at: Date }>(
        `UPDATE verification_requests
         SET status=$2,notes=$3,reviewed_by=$4,reviewed_at=clock_timestamp(),
             updated_at=GREATEST(clock_timestamp(),updated_at+interval '1 microsecond')
         WHERE id=$1 AND status='pending'
         RETURNING reviewed_at`,
        [requestId, decision, notes, actor.id]
      );
      if (!reviewed.rows[0]) throw new ConflictException('This verification request has already been decided.');

      let oldAuditStatus = 'verification:pending';
      let newAuditStatus = `verification:${decision}`;
      if (entityType === 'business' && decision === 'approved') {
        oldAuditStatus = current.trust_status ?? 'pending';
        newAuditStatus = 'approved';
        await client.query(
          `UPDATE business_profiles
           SET trust_status='approved',updated_at=GREATEST(clock_timestamp(),updated_at+interval '1 microsecond')
           WHERE id=$1`,
          [entityId]
        );
      }

      await client.query(
        `INSERT INTO trust_history (id,entity_type,entity_id,old_status,new_status,changed_by,reason,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,clock_timestamp())`,
        [randomUUID(), entityType, entityId, oldAuditStatus, newAuditStatus, actor.id, notes]
      );

      return {
        requestId,
        entityType,
        entityId,
        label: current.label,
        profileRevision: revision,
        createdAt: latest.rows[0].created_at.toISOString(),
        profileSummary: current.profile_summary,
        evidence: evidence.rows.map((item) => ({
          id: item.id,
          filename: item.filename,
          mimeType: item.mime_type,
          sizeBytes: item.size_bytes,
          createdAt: item.created_at.toISOString(),
          secureUrl: `/api/v1/media/public/${encodeURIComponent(item.id)}`
        })),
        status: decision,
        reviewedAt: reviewed.rows[0].reviewed_at.toISOString()
      };
    });
  }

  private async requireReviewer(cookieHeader: string | undefined, allowBoundedApproval: boolean) {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    if (allowBoundedApproval) {
      this.rbac.assertAny(actor.email, ['security.manage', 'trust.approvals.approve']);
    } else {
      this.rbac.assert(actor.email, 'security.manage');
    }
    return actor;
  }

  private requireRequestId(value: unknown): string {
    if (typeof value !== 'string' || value.length < 1 || value.length > 200 || /[\u0000-\u001F\u007F]/.test(value)) {
      throw new BadRequestException('A valid verification request id is required.');
    }
    return value;
  }

  private requireRevision(value: unknown): string {
    if (typeof value !== 'string' || !REVISION_PATTERN.test(value)) {
      throw new BadRequestException('expectedRevision must identify the exact profile revision shown to the reviewer.');
    }
    return value;
  }

  private requireNotes(value: unknown): string {
    if (typeof value !== 'string') throw new BadRequestException('Verification review notes are required.');
    const notes = value.trim();
    if (notes.length < 10 || notes.length > 2000) {
      throw new BadRequestException('Verification review notes must contain between 10 and 2000 characters.');
    }
    return notes;
  }
}
