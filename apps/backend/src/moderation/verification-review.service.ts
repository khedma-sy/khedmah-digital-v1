import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
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
    projection: `name AS label, trust_status, moderation_status, status, NULL::text AS lifecycle_status`
  },
  professional: {
    table: 'professional_profiles',
    id: 'professional_profile_identifier',
    projection: `COALESCE(NULLIF(BTRIM(headline_ar),''), professional_profile_identifier) AS label,
      NULL::text AS trust_status, moderation_status, NULL::text AS status, lifecycle_status`
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
    await this.requireReviewer(cookieHeader);
    const rows = await this.db.query<{
      request_id: string;
      entity_type: VerificationEntityType;
      entity_id: string;
      label: string;
      profile_revision: string;
      request_created_at: Date;
    }>(`
      WITH latest AS (
        SELECT DISTINCT ON (entity_type, entity_id)
          id, entity_type, entity_id, status, created_at
        FROM verification_requests
        ORDER BY entity_type, entity_id, created_at DESC, id DESC
      )
      SELECT vr.id AS request_id, vr.entity_type, vr.entity_id, b.name AS label,
        to_char(b.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS profile_revision,
        vr.created_at AS request_created_at
      FROM latest vr
      JOIN business_profiles b ON vr.entity_type='business' AND b.id=vr.entity_id
      WHERE vr.status='pending'
      UNION ALL
      SELECT vr.id AS request_id, vr.entity_type, vr.entity_id,
        COALESCE(NULLIF(BTRIM(p.headline_ar),''), p.professional_profile_identifier) AS label,
        to_char(p.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS profile_revision,
        vr.created_at AS request_created_at
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
      createdAt: row.request_created_at.toISOString()
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
    const actor = await this.requireReviewer(cookieHeader);
    const requestId = this.requireRequestId(requestIdValue);
    const revision = this.requireRevision(expectedRevision);
    const notes = this.requireNotes(notesValue);

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
        trust_status: string | null;
        moderation_status: string;
        status: string | null;
        lifecycle_status: string | null;
        revision: string;
      }>(
        `SELECT ${target.projection}, ${PROFILE_REVISION_SQL} AS revision
         FROM ${target.table} WHERE ${target.id}=$1 FOR UPDATE`,
        [entityId]
      );
      const current = parent.rows[0];
      if (!current) throw new ConflictException('The verification target no longer exists.');

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
        status: decision,
        reviewedAt: reviewed.rows[0].reviewed_at.toISOString()
      };
    });
  }

  private async requireReviewer(cookieHeader: string | undefined) {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    this.rbac.assert(actor.email, 'security.manage');
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
