import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { IdentityService } from '../identity/identity.service';
import { readSessionToken } from '../identity/session-cookie';
import { OperationsRbacService } from '../operations-product/operations-rbac.service';
import { createStorageAdapter, StorageAdapter } from './storage.adapter';

export type DriverDocumentReviewStatus = 'pending' | 'approved' | 'rejected';

export interface DriverDocumentReviewItem {
  readonly id: string;
  readonly businessProfileId: string;
  readonly documentType: 'driver_photo' | 'identity_card' | 'driving_license' | 'vehicle_license';
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly reviewStatus: DriverDocumentReviewStatus;
  readonly reviewReason?: string;
  readonly reviewedAt?: string;
  readonly createdAt: string;
  readonly secureUrl: string;
}

@Injectable()
export class DriverDocumentReviewService {
  private readonly storage: StorageAdapter;

  constructor(
    @Inject(DatabasePool) private readonly db: DatabasePool,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(OperationsRbacService) private readonly rbac: OperationsRbacService
  ) {
    this.storage = createStorageAdapter();
  }

  async list(cookieHeader: string | undefined, businessProfileId: string): Promise<DriverDocumentReviewItem[]> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    await this.assertBusinessOwnerOrReviewer(actor.id, actor.email, businessProfileId);
    const rows = await this.db.query<{
      id: string; business_profile_id: string; asset_type: DriverDocumentReviewItem['documentType']; filename: string;
      mime_type: string; size_bytes: number; review_status: DriverDocumentReviewStatus | null; review_reason: string | null;
      reviewed_at: Date | null; created_at: Date;
    }>(
      `SELECT m.id,m.owner_id AS business_profile_id,m.asset_type,m.filename,m.mime_type,m.size_bytes,
              r.status AS review_status,r.review_reason,r.reviewed_at,m.created_at
       FROM media_assets m
       LEFT JOIN mobility_document_reviews r ON r.media_asset_id=m.id
       WHERE m.owner_type='business_profile' AND m.owner_id=$1 AND m.visibility='private'
         AND m.asset_type IN ('driver_photo','identity_card','driving_license','vehicle_license')
       ORDER BY COALESCE(r.created_at,m.created_at) DESC,m.id DESC`,
      [businessProfileId]
    );
    return rows.map(row => ({
      id: row.id,
      businessProfileId: row.business_profile_id,
      documentType: row.asset_type,
      filename: row.filename,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      reviewStatus: row.review_status ?? 'pending',
      reviewReason: row.review_reason ?? undefined,
      reviewedAt: row.reviewed_at?.toISOString(),
      createdAt: row.created_at.toISOString(),
      secureUrl: `/api/v1/driver-documents/${encodeURIComponent(row.id)}/content`
    }));
  }

  async reviewQueue(cookieHeader: string | undefined) {
    const actor=await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    this.rbac.assert(actor.email,'security.manage');
    const rows=await this.db.query<{business_profile_id:string;name:string;category_code:string;city_code:string;pending:string}>(`
      WITH latest AS (
        SELECT DISTINCT ON (business_profile_id,document_type) business_profile_id,document_type,status,created_at
        FROM mobility_document_reviews
        WHERE document_type IN ('driver_photo','identity_card','driving_license','vehicle_license')
        ORDER BY business_profile_id,document_type,created_at DESC,media_asset_id DESC
      )
      SELECT b.id AS business_profile_id,b.name,b.category_code,b.city_code,COUNT(*)::text AS pending
      FROM latest r JOIN business_profiles b ON b.id=r.business_profile_id
      WHERE r.status='pending' AND b.category_code IN ('taxi','delivery_courier')
      GROUP BY b.id,b.name,b.category_code,b.city_code
      ORDER BY MIN(r.created_at),b.id LIMIT 200`);
    return {businesses:rows.map(row=>({businessProfileId:row.business_profile_id,name:row.name,categoryCode:row.category_code,cityCode:row.city_code,pendingDocuments:Number(row.pending)}))};
  }

  async read(cookieHeader: string | undefined, id: string): Promise<{ data: Buffer; mimeType: string }> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const [row] = await this.db.query<{
      storage_key: string; mime_type: string; owner_id: string; owner_user_id: string;
    }>(
      `SELECT storage_key,mime_type,owner_id,owner_user_id
       FROM media_assets
       WHERE id=$1 AND owner_type='business_profile' AND visibility='private'
         AND asset_type IN ('driver_photo','identity_card','driving_license','vehicle_license')
       LIMIT 1`,
      [id]
    );
    if (!row) throw new NotFoundException('Driver document was not found.');
    if (row.owner_user_id !== actor.id) this.rbac.assert(actor.email, 'security.manage');
    const object = await this.storage.read(row.storage_key);
    return { data: object.data, mimeType: row.mime_type || object.mimeType };
  }

  async review(
    cookieHeader: string | undefined,
    id: string,
    status: unknown,
    reason: unknown
  ): Promise<{ id: string; status: 'approved' | 'rejected'; reason?: string; reviewedAt: string }> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    this.rbac.assert(actor.email, 'security.manage');
    if (status !== 'approved' && status !== 'rejected') throw new BadRequestException('Document review status is invalid.');
    const normalizedReason = typeof reason === 'string' && reason.trim() ? reason.trim() : undefined;
    if (status === 'rejected' && (!normalizedReason || normalizedReason.length < 5)) {
      throw new BadRequestException('A rejection reason of at least five characters is required.');
    }
    if (normalizedReason && normalizedReason.length > 500) throw new BadRequestException('Review reason is too long.');
    const reviewedAt = new Date().toISOString();

    return this.db.transaction(async client => {
      const candidate = await client.query<{ owner_id: string }>(
        `SELECT owner_id FROM media_assets
         WHERE id=$1 AND owner_type='business_profile' AND visibility='private'
           AND asset_type IN ('driver_photo','identity_card','driving_license','vehicle_license')`,
        [id]
      );
      if (!candidate.rows[0]) throw new NotFoundException('Driver document was not found.');
      const business = await client.query<{ id: string }>(
        `SELECT id FROM business_profiles WHERE id=$1 FOR UPDATE`,
        [candidate.rows[0].owner_id]
      );
      if (!business.rows[0]) throw new NotFoundException('Business profile was not found.');
      const locked = await client.query<{ owner_id: string; asset_type: DriverDocumentReviewItem['documentType'] }>(
        `SELECT owner_id,asset_type FROM media_assets
         WHERE id=$1 AND owner_type='business_profile' AND visibility='private'
           AND asset_type IN ('driver_photo','identity_card','driving_license','vehicle_license')
         FOR UPDATE`,
        [id]
      );
      const document = locked.rows[0];
      if (!document || document.owner_id !== candidate.rows[0].owner_id) throw new NotFoundException('Driver document was not found.');
      await client.query(
        `INSERT INTO mobility_document_reviews
           (media_asset_id,business_profile_id,document_type,status,review_reason,reviewed_by,reviewed_at,created_at,updated_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$7,$7)
         ON CONFLICT(media_asset_id) DO UPDATE SET status=EXCLUDED.status,review_reason=EXCLUDED.review_reason,
           reviewed_by=EXCLUDED.reviewed_by,reviewed_at=EXCLUDED.reviewed_at,updated_at=EXCLUDED.updated_at`,
        [id, document.owner_id, document.asset_type, status, status === 'rejected' ? normalizedReason : null, actor.id, reviewedAt]
      );
      await client.query(
        `INSERT INTO mobility_document_review_events
           (id,media_asset_id,business_profile_id,document_type,status,review_reason,actor_user_id,created_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [randomUUID(), id, document.owner_id, document.asset_type, status, status === 'rejected' ? normalizedReason : null, actor.id, reviewedAt]
      );
      if (status === 'rejected') {
        await client.query(
          `UPDATE business_profiles
           SET visibility='private',moderation_status='pending',trust_status='pending',updated_at=$2
           WHERE id=$1 AND category_code IN ('taxi','delivery_courier')`,
          [document.owner_id, reviewedAt]
        );
      }
      return { id, status, reason: status === 'rejected' ? normalizedReason : undefined, reviewedAt };
    });
  }

  private async assertBusinessOwnerOrReviewer(actorId: string, email: string, businessProfileId: string): Promise<void> {
    const [row] = await this.db.query<{ owner_user_id: string }>(
      `SELECT owner_user_id FROM business_profiles WHERE id=$1 LIMIT 1`,
      [businessProfileId]
    );
    if (!row) throw new NotFoundException('Business profile was not found.');
    if (row.owner_user_id === actorId) return;
    try {
      this.rbac.assert(email, 'security.manage');
    } catch (cause) {
      if (cause instanceof ForbiddenException) throw cause;
      throw cause;
    }
  }
}
