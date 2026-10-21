import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabasePool } from '../database/database.pool';
import { IdentityService } from '../identity/identity.service';
import { readSessionToken } from '../identity/session-cookie';
import { OperationsRbacService } from '../operations-product/operations-rbac.service';
import { createStorageAdapter, StorageAdapter } from './storage.adapter';
import { MediaAsset, PublicMediaAsset, UploadMediaRequest } from './media.types';
import { validateUploadMediaRequest } from './media.validation';

const VERIFICATION_EVIDENCE_TYPES = new Set([
  'business_verification_evidence',
  'professional_verification_evidence'
]);

const MOBILITY_DOCUMENT_TYPES = new Set([
  'driver_photo',
  'identity_card',
  'driving_license',
  'vehicle_license'
]);

@Injectable()
export class MediaService {
  private readonly storage: StorageAdapter;
  private readonly logger = new Logger(MediaService.name);

  constructor(
    @Inject(DatabasePool) private readonly db: DatabasePool,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(OperationsRbacService) private readonly rbac: OperationsRbacService = new OperationsRbacService()
  ) {
    this.storage = createStorageAdapter();
  }

  async upload(cookieHeader: string | undefined, request: UploadMediaRequest): Promise<PublicMediaAsset> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const input = validateUploadMediaRequest(request);
    await this.assertOwner(actor.id, input.ownerType, input.ownerId);

    const content = Buffer.from(input.content, 'base64');
    if (content.length !== input.sizeBytes || !this.matchesMimeSignature(content, input.mimeType)) {
      throw new BadRequestException('Uploaded image content does not match its declared size or type.');
    }
    const id = randomUUID();
    const ext = input.mimeType.split('/')[1];
    const storageKey = `media/${input.ownerType}/${input.ownerId}/${id}.${ext}`;
    const now = new Date().toISOString();

    const existing = (input.ownerType === 'business_profile' || input.ownerType === 'product_listing') && input.assetType
      ? await this.db.query<{ id: string; storage_key: string }>(
          `SELECT id, storage_key FROM media_assets WHERE owner_type = $1 AND owner_id = $2 AND asset_type = $3 ORDER BY created_at ASC`,
          [input.ownerType, input.ownerId, input.assetType]
        )
      : [];
    const imageLimit = input.assetType === 'gallery' ? 12 : input.assetType === 'product_image' ? 5 : undefined;
    if (imageLimit !== undefined && existing.length >= imageLimit) {
      throw new BadRequestException(`يمكن رفع ${imageLimit} صورة كحد أقصى.`);
    }

    await this.storage.save(storageKey, content, input.mimeType);

    const asset: MediaAsset = {
      id,
      ownerUserId: actor.id,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      visibility: input.visibility,
      storageKey,
      publicUrl: input.visibility === 'public' ? `/api/v1/media/public/${id}` : undefined,
      assetType: input.assetType,
      sortOrder: input.sortOrder,
      createdAt: now,
      updatedAt: now
    };

    const insertSql = `INSERT INTO media_assets
         (id, owner_user_id, owner_type, owner_id, filename, mime_type,
          size_bytes, visibility, storage_key, public_url, asset_type, sort_order, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`;
    const insertValues = [
        asset.id, asset.ownerUserId, asset.ownerType, asset.ownerId,
        asset.filename, asset.mimeType, asset.sizeBytes, asset.visibility,
        asset.storageKey, asset.publicUrl ?? null, asset.assetType ?? null, asset.sortOrder, asset.createdAt, asset.updatedAt
      ];

    if (input.ownerType === 'product_listing') {
      try {
        await this.db.transaction(async (client) => {
          await this.lockProductOwner(client, input.ownerId, actor.id);
          const count = await client.query<{ count: number }>(
            `SELECT count(*)::int AS count FROM media_assets WHERE owner_type='product_listing' AND owner_id=$1 AND asset_type='product_image'`, [input.ownerId]);
          if (count.rows[0].count >= 5) throw new BadRequestException('يمكن رفع 5 صور كحد أقصى.');
          await client.query(insertSql, insertValues);
          await this.invalidateProductReview(client, input.ownerId);
        });
      } catch (cause) {
        // These validation failures happen before insertion, so this object is unreferenced.
        // Never delete on an uncertain commit outcome.
        if (cause instanceof BadRequestException || cause instanceof ForbiddenException || cause instanceof NotFoundException) {
          try { await this.storage.delete(storageKey); } catch { this.logger.warn('Product upload object cleanup failed.'); }
        }
        throw cause;
      }
    } else if (input.ownerType === 'business_profile' || input.ownerType === 'professional_profile') {
      let retired: string[];
      try {
        retired = await this.db.transaction(async (client) => {
          await this.lockProfileOwner(client, input.ownerType as 'business_profile' | 'professional_profile', input.ownerId, actor.id);
          const mobilityCategory = input.assetType && MOBILITY_DOCUMENT_TYPES.has(input.assetType)
            ? await this.requireMobilityProfile(client, input.ownerType, input.ownerId)
            : undefined;
          const current = await client.query<{ id: string; storage_key: string }>(
            `SELECT id,storage_key FROM media_assets WHERE owner_type=$1 AND owner_id=$2 AND asset_type=$3 ORDER BY created_at,id`, [input.ownerType,input.ownerId,input.assetType ?? null]);
          if (input.assetType === 'gallery' && current.rows.length >= 12) throw new BadRequestException('يمكن رفع 12 صورة كحد أقصى.');
          if (input.assetType && VERIFICATION_EVIDENCE_TYPES.has(input.assetType) && current.rows.length >= 3) {
            throw new BadRequestException('يمكن رفع 3 صور إثبات كحد أقصى.');
          }
          await client.query(insertSql, insertValues);
          if (mobilityCategory === 'taxi') {
            await this.invalidateTaxiOperationalApproval(client, input.ownerId, actor.id);
          }
          const replaced = input.assetType === 'logo' || input.assetType === 'cover';
          if (replaced) await client.query(`DELETE FROM media_assets WHERE owner_type=$1 AND owner_id=$2 AND asset_type=$3 AND id<>$4`, [input.ownerType,input.ownerId,input.assetType,asset.id]);
          await this.invalidateProfileReview(
            client,
            input.ownerType as 'business_profile' | 'professional_profile',
            input.ownerId,
            Boolean(input.assetType && VERIFICATION_EVIDENCE_TYPES.has(input.assetType)),
            actor.id
          );
          return replaced ? current.rows.map(row => row.storage_key) : [];
        });
      } catch (cause) {
        if (cause instanceof BadRequestException || cause instanceof ForbiddenException || cause instanceof NotFoundException) {
          try { await this.storage.delete(storageKey); } catch { this.logger.warn('Profile upload object cleanup failed.'); }
        }
        throw cause;
      }
      for (const key of retired) {
        try { await this.storage.delete(key); } catch { this.logger.warn('Replaced profile image cleanup failed.'); }
      }
    } else await this.db.query(insertSql, insertValues);

    return this.toPublic(asset);
  }

  async listForOwner(cookieHeader: string | undefined, ownerType: string, ownerId: string): Promise<PublicMediaAsset[]> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    if (!['business_profile','professional_profile','product_listing','user'].includes(ownerType)) throw new BadRequestException('Unsupported media owner type.');
    await this.assertOwner(actor.id, ownerType as MediaAsset['ownerType'], ownerId);
    const rows = await this.db.query<{
      id: string; owner_user_id: string; owner_type: string; owner_id: string;
      filename: string; mime_type: string; size_bytes: number; visibility: string;
      storage_key: string; public_url: string | null; asset_type: string | null; sort_order: number; created_at: Date; updated_at: Date;
    }>(
      `SELECT id, owner_user_id, owner_type, owner_id, filename, mime_type,
              size_bytes, visibility, storage_key, public_url, asset_type, sort_order, created_at, updated_at
       FROM media_assets
       WHERE owner_type = $1 AND owner_id = $2`,
      [ownerType, ownerId]
    );

    await this.assertOwner(actor.id, ownerType as MediaAsset['ownerType'], ownerId);
    return rows
      .filter((r) => r.visibility === 'public' || r.owner_user_id === actor.id)
      .map((r) => this.toPublic(this.mapRow(r)));
  }

  async delete(cookieHeader: string | undefined, id: string): Promise<void> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const rows = await this.db.query<{ owner_user_id: string; storage_key: string; owner_type: string; owner_id: string; asset_type: string | null }>(
      `SELECT owner_user_id, storage_key, owner_type, owner_id, asset_type FROM media_assets WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (!rows[0]) throw new NotFoundException('Media asset not found.');
    if (rows[0].owner_user_id !== actor.id) throw new ForbiddenException('Access denied.');

    // Ad media writes belong to the revision-bound Classifieds lifecycle.
    if (rows[0].owner_type === 'ad_listing') {
      throw new ForbiddenException('Classifieds images must be removed through the Classifieds media endpoint.');
    }

    if (rows[0].owner_type === 'product_listing') {
      const ownerId = rows[0].owner_id;
      await this.db.transaction(async (client) => {
        // Every product/image mutation locks the parent before touching its media.
        await this.lockProductOwner(client, ownerId, actor.id);
        const removed = await client.query(`DELETE FROM media_assets WHERE id=$1 AND owner_user_id=$2 RETURNING id`, [id, actor.id]);
        if (!removed.rowCount) throw new NotFoundException('Media asset not found.');
        await this.invalidateProductReview(client, ownerId);
      });
      // The public read endpoint no longer resolves the removed ID, even if storage is unavailable.
      try { await this.storage.delete(rows[0].storage_key); } catch { this.logger.warn('Removed product image object cleanup failed.'); }
      return;
    }

    if (rows[0].owner_type === 'business_profile' || rows[0].owner_type === 'professional_profile') {
      const ownerType = rows[0].owner_type;
      const ownerId = rows[0].owner_id;
      let storageKey = rows[0].storage_key;
      await this.db.transaction(async (client) => {
        await this.lockProfileOwner(client, ownerType, ownerId, actor.id);
        const locked = await client.query<{ storage_key: string; asset_type: string | null }>(
          `SELECT storage_key,asset_type FROM media_assets
           WHERE id=$1 AND owner_type=$2 AND owner_id=$3 AND owner_user_id=$4
           FOR UPDATE`,
          [id, ownerType, ownerId, actor.id]
        );
        const current = locked.rows[0];
        if (!current) throw new NotFoundException('Media asset not found.');
        if (current.asset_type && MOBILITY_DOCUMENT_TYPES.has(current.asset_type)) {
          throw new ForbiddenException('Mobility documents cannot be deleted. Upload a newer replacement for human review.');
        }
        storageKey = current.storage_key;
        const removed = await client.query(`DELETE FROM media_assets WHERE id=$1 AND owner_user_id=$2 RETURNING id`, [id,actor.id]);
        if (!removed.rowCount) throw new NotFoundException('Media asset not found.');
        await this.invalidateProfileReview(
          client,
          ownerType,
          ownerId,
          Boolean(current.asset_type && VERIFICATION_EVIDENCE_TYPES.has(current.asset_type)),
          actor.id
        );
      });
      try { await this.storage.delete(storageKey); } catch { this.logger.warn('Removed media object cleanup failed.'); }
      return;
    } else {
      const removed = await this.db.query(`DELETE FROM media_assets WHERE id=$1 AND owner_user_id=$2 RETURNING id`, [id,actor.id]);
      if (!removed.length) throw new NotFoundException('Media asset not found.');
    }
    try { await this.storage.delete(rows[0].storage_key); } catch { this.logger.warn('Removed media object cleanup failed.'); }
  }

  async readPublic(id: string, cookieHeader?: string): Promise<{ data: Buffer; mimeType: string }> {
    const asset = await this.readAssetMetadata(id);
    await this.assertAssetReadable(asset, cookieHeader);
    const object = await this.storage.read(asset.storage_key);
    const current = await this.readAssetMetadata(id);
    if (current.storage_key !== asset.storage_key || current.owner_type !== asset.owner_type || current.owner_id !== asset.owner_id || current.asset_type !== asset.asset_type) {
      throw new NotFoundException('Media asset not found.');
    }
    await this.assertAssetReadable(current, cookieHeader);
    return { data: object.data, mimeType: current.mime_type || object.mimeType };
  }

  private async readAssetMetadata(id: string) {
    const rows = await this.db.query<{ storage_key: string; mime_type: string; owner_type: MediaAsset['ownerType']; owner_id: string; visibility: string; asset_type: string | null }>(
      `SELECT storage_key,mime_type,owner_type,owner_id,visibility,asset_type FROM media_assets WHERE id=$1 LIMIT 1`, [id]);
    if (!rows[0]) throw new NotFoundException('Media asset not found.');
    return rows[0];
  }

  private async assertAssetReadable(asset: { owner_type: MediaAsset['ownerType']; owner_id: string; visibility: string; asset_type: string | null }, cookieHeader?: string): Promise<void> {
    if (asset.visibility === 'public' && await this.hasPublicParent(asset.owner_type, asset.owner_id)) return;
    const token = readSessionToken(cookieHeader);
    if (!token) throw new NotFoundException('Media asset not found.');
    let actor;
    try { actor = await this.identity.getCurrentUser(token); }
    catch (cause) {
      if (cause instanceof UnauthorizedException) throw new NotFoundException('Media asset not found.');
      throw cause;
    }
    try { await this.assertOwner(actor.id, asset.owner_type, asset.owner_id); return; }
    catch (cause) { if (!(cause instanceof ForbiddenException)) throw cause; }
    // Reviewers may inspect publishable profile/product images, never another user's private files.
    const contentReviewOwnerType = asset.owner_type === 'business_profile' || asset.owner_type === 'professional_profile'
      || asset.owner_type === 'product_listing' ? asset.owner_type : undefined;
    if (asset.visibility === 'public' && contentReviewOwnerType) {
      try {
        this.rbac.assertAny(actor.email, ['security.manage', 'content.approvals.approve']);
        try { this.rbac.assert(actor.email, 'security.manage'); return; }
        catch (cause) { if (!(cause instanceof ForbiddenException)) throw cause; }
        if (await this.hasPendingContentReview(contentReviewOwnerType, asset.owner_id)) return;
      }
      catch (cause) { if (!(cause instanceof ForbiddenException)) throw cause; }
    }
    const verificationEvidenceOwnerType =
      asset.owner_type === 'business_profile' && asset.asset_type === 'business_verification_evidence' ? 'business_profile' :
      asset.owner_type === 'professional_profile' && asset.asset_type === 'professional_verification_evidence' ? 'professional_profile' : undefined;
    if (asset.visibility === 'private' && verificationEvidenceOwnerType) {
      try {
        this.rbac.assertAny(actor.email, ['security.manage', 'trust.approvals.approve']);
        if (await this.hasCurrentPendingVerificationRequest(verificationEvidenceOwnerType, asset.owner_id)) return;
      }
      catch (cause) { if (!(cause instanceof ForbiddenException)) throw cause; }
    }
    throw new NotFoundException('Media asset not found.');
  }

  private async hasPublicParent(ownerType: MediaAsset['ownerType'], id: string): Promise<boolean> {
    let sql: string;
    if (ownerType === 'business_profile') sql = `SELECT 1 FROM business_profiles WHERE id=$1 AND visibility = 'public' AND moderation_status='approved' AND trust_status='approved' AND status='active'`;
    else if (ownerType === 'professional_profile') sql = `SELECT 1 FROM professional_profiles WHERE professional_profile_identifier=$1 AND visibility = 'public' AND moderation_status='approved' AND lifecycle_status='active'`;
    else if (ownerType === 'product_listing') sql = `SELECT 1 FROM product_listings p JOIN business_profiles b ON b.id=p.business_profile_id WHERE p.id=$1 AND p.status='active' AND p.moderation_status='approved' AND b.visibility = 'public' AND b.moderation_status='approved' AND b.trust_status='approved' AND b.status='active'`;
    else if (ownerType === 'user') sql = `SELECT 1 FROM core_user_accounts WHERE user_identifier=$1 AND account_status='active' AND lifecycle_status='active'`;
    else return false;
    return (await this.db.query(sql, [id])).length > 0;
  }

  private async hasCurrentPendingVerificationRequest(
    ownerType: 'business_profile' | 'professional_profile',
    ownerId: string
  ): Promise<boolean> {
    const entityType = ownerType === 'business_profile' ? 'business' : 'professional';
    const parentTable = ownerType === 'business_profile' ? 'business_profiles' : 'professional_profiles';
    const parentId = ownerType === 'business_profile' ? 'id' : 'professional_profile_identifier';
    const rows = await this.db.query(
      `SELECT 1 FROM verification_requests vr
       JOIN ${parentTable} p ON p.${parentId}=vr.entity_id
       WHERE vr.id=(
         SELECT id FROM verification_requests
         WHERE entity_type=$1 AND entity_id=$2
         ORDER BY created_at DESC,id DESC LIMIT 1
       ) AND vr.entity_type=$1 AND vr.entity_id=$2 AND vr.status='pending'`,
      [entityType, ownerId]
    );
    return rows.length > 0;
  }

  private async hasPendingContentReview(
    ownerType: 'business_profile' | 'professional_profile' | 'product_listing',
    ownerId: string
  ): Promise<boolean> {
    let sql: string;
    if (ownerType === 'business_profile') {
      sql = `SELECT 1 FROM business_profiles WHERE id=$1 AND moderation_status='pending'`;
    } else if (ownerType === 'professional_profile') {
      sql = `SELECT 1 FROM professional_profiles WHERE professional_profile_identifier=$1 AND moderation_status='pending'`;
    } else {
      sql = `SELECT 1 FROM product_listings WHERE id=$1 AND status='active' AND moderation_status='pending'`;
    }
    return (await this.db.query(sql, [ownerId])).length > 0;
  }

  private toPublic(asset: MediaAsset): PublicMediaAsset {
    return {
      id: asset.id,
      ownerType: asset.ownerType,
      ownerId: asset.ownerId,
      filename: asset.filename,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      visibility: asset.visibility,
      publicUrl: asset.publicUrl,
      assetType: asset.assetType,
      sortOrder: asset.sortOrder,
      createdAt: asset.createdAt
    };
  }

  private mapRow(r: {
    id: string; owner_user_id: string; owner_type: string; owner_id: string;
    filename: string; mime_type: string; size_bytes: number; visibility: string;
    storage_key: string; public_url: string | null; asset_type: string | null; sort_order: number; created_at: Date; updated_at: Date;
  }): MediaAsset {
    return {
      id: r.id,
      ownerUserId: r.owner_user_id,
      ownerType: r.owner_type as MediaAsset['ownerType'],
      ownerId: r.owner_id,
      filename: r.filename,
      mimeType: r.mime_type as MediaAsset['mimeType'],
      sizeBytes: r.size_bytes,
      visibility: r.visibility as MediaAsset['visibility'],
      storageKey: r.storage_key,
      publicUrl: r.public_url ?? undefined,
      assetType: r.asset_type as MediaAsset['assetType'],
      sortOrder: r.sort_order,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString()
    };
  }

  private async lockProfileOwner(client: PoolClient, ownerType: 'business_profile' | 'professional_profile', id: string, actorId: string): Promise<void> {
    const table = ownerType === 'business_profile' ? 'business_profiles' : 'professional_profiles';
    const idColumn = ownerType === 'business_profile' ? 'id' : 'professional_profile_identifier';
    const ownerColumn = ownerType === 'business_profile' ? 'owner_user_id' : 'user_identifier';
    const result = await client.query<{ owner_user_id: string }>(`SELECT ${ownerColumn} AS owner_user_id FROM ${table} WHERE ${idColumn}=$1 FOR UPDATE`, [id]);
    if (!result.rows[0]) throw new NotFoundException('Media owner not found.');
    if (result.rows[0].owner_user_id !== actorId) throw new ForbiddenException('Access denied.');
  }

  private async requireMobilityProfile(
    client: PoolClient,
    ownerType: MediaAsset['ownerType'],
    id: string
  ): Promise<'taxi' | 'delivery_courier'> {
    if (ownerType !== 'business_profile') {
      throw new BadRequestException('Mobility documents require a Taxi or delivery courier business profile.');
    }
    const result = await client.query<{ category_code: string }>(
      `SELECT category_code FROM business_profiles WHERE id=$1`,
      [id]
    );
    const category = result.rows[0]?.category_code;
    if (category !== 'taxi' && category !== 'delivery_courier') {
      throw new BadRequestException('Mobility documents require a Taxi or delivery courier business profile.');
    }
    return category;
  }

  private async invalidateTaxiOperationalApproval(client: PoolClient, businessProfileId: string, actorId: string): Promise<void> {
    const schema = await client.query<{ ready: boolean }>(
      `SELECT to_regclass('khedmah_taxi.driver_approvals') IS NOT NULL
           AND to_regclass('khedmah_taxi.vehicle_approvals') IS NOT NULL AS ready`
    );
    if (schema.rows[0]?.ready !== true) return;

    // Taxi writers lock profile -> vehicle -> driver. Follow that order while
    // inspecting the decision, then delete driver before vehicle to satisfy
    // the driver-to-vehicle foreign key.
    const currentVehicles = await client.query<{ status: string }>(
      `SELECT status FROM khedmah_taxi.vehicle_approvals
       WHERE business_profile_id=$1 FOR UPDATE`,
      [businessProfileId]
    );
    const currentDrivers = await client.query<{ status: string }>(
      `SELECT status FROM khedmah_taxi.driver_approvals
       WHERE business_profile_id=$1 FOR UPDATE`,
      [businessProfileId]
    );
    if (!currentDrivers.rowCount && !currentVehicles.rowCount) return;

    const currentStatuses = [...currentDrivers.rows, ...currentVehicles.rows].map((row) => row.status);
    const oldStatus = `taxi:driver=${currentDrivers.rows[0]?.status ?? 'none'},vehicle=${currentVehicles.rows[0]?.status ?? 'none'}`;
    if (currentStatuses.some((status) => status === 'suspended' || status === 'revoked')) {
      await this.recordTaxiDocumentAudit(
        client,
        businessProfileId,
        actorId,
        oldStatus,
        'taxi:restriction_preserved',
        'A newer Taxi mobility document was uploaded; the existing security restriction remains in force.'
      );
      return;
    }

    // Removing mutable approved rows invalidates operational access immediately
    // while append-only operational_approval_events remain intact.
    const drivers = await client.query<{ status: string }>(
      `DELETE FROM khedmah_taxi.driver_approvals
       WHERE business_profile_id=$1 RETURNING status`,
      [businessProfileId]
    );
    const vehicles = await client.query<{ status: string }>(
      `DELETE FROM khedmah_taxi.vehicle_approvals
       WHERE business_profile_id=$1 RETURNING status`,
      [businessProfileId]
    );
    if (!drivers.rowCount && !vehicles.rowCount) return;

    await this.recordTaxiDocumentAudit(
      client,
      businessProfileId,
      actorId,
      oldStatus,
      'taxi:review_required',
      'A newer Taxi mobility document was uploaded; the previous operational approval was invalidated.'
    );
  }

  private async recordTaxiDocumentAudit(
    client: PoolClient,
    businessProfileId: string,
    actorId: string,
    oldStatus: string,
    newStatus: string,
    reason: string
  ): Promise<void> {
    await client.query(
      `INSERT INTO trust_history (id,entity_type,entity_id,old_status,new_status,changed_by,reason,created_at)
       VALUES($1,'business',$2,$3,$4,$5,$6,clock_timestamp())`,
      [randomUUID(), businessProfileId, oldStatus, newStatus, actorId, reason]
    );
  }

  private async invalidateProfileReview(
    client: PoolClient,
    ownerType: 'business_profile' | 'professional_profile',
    id: string,
    invalidateVerification = false,
    actorId?: string
  ): Promise<void> {
    const table = ownerType === 'business_profile' ? 'business_profiles' : 'professional_profiles';
    const idColumn = ownerType === 'business_profile' ? 'id' : 'professional_profile_identifier';
    if (!invalidateVerification) {
      await client.query(`UPDATE ${table} SET moderation_status=CASE WHEN moderation_status='suspended' THEN 'suspended' ELSE 'pending' END,
        updated_at=GREATEST(clock_timestamp(),updated_at+interval '1 microsecond') WHERE ${idColumn}=$1`, [id]);
      return;
    }
    await client.query(
      `UPDATE ${table} SET updated_at=GREATEST(clock_timestamp(),updated_at+interval '1 microsecond') WHERE ${idColumn}=$1`,
      [id]
    );
    const entityType = ownerType === 'business_profile' ? 'business' : 'professional';
    const latestVerification = await client.query<{ id: string; status: string }>(
      `SELECT id,status FROM verification_requests
       WHERE entity_type=$1 AND entity_id=$2
       ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE`,
      [entityType, id]
    );
    if (latestVerification.rows[0]?.status !== 'approved') return;
    if (!actorId) throw new Error('Verification evidence invalidation requires an authenticated actor.');
    // This V1 contract binds review to the current evidence set through the locked parent
    // revision. It deliberately creates a new request instead of rewriting the historical
    // approved decision; it is not an immutable evidence-file archive.
    await client.query(
      `INSERT INTO verification_requests
         (id,entity_type,entity_id,requester_id,status,created_at,updated_at)
       VALUES($1,$2,$3,$4,'pending',clock_timestamp(),clock_timestamp())`,
      [randomUUID(), entityType, id, actorId]
    );
    if (ownerType === 'business_profile') {
      await client.query(
        `UPDATE business_profiles
         SET trust_status=CASE WHEN trust_status='suspended' THEN 'suspended' ELSE 'pending' END,
             updated_at=GREATEST(clock_timestamp(),updated_at+interval '1 microsecond')
         WHERE id=$1`,
        [id]
      );
    }
    await client.query(
      `INSERT INTO trust_history (id,entity_type,entity_id,old_status,new_status,changed_by,reason,created_at)
       VALUES($1,$2,$3,'verification:approved','verification:pending',$4,$5,clock_timestamp())`,
      [randomUUID(), entityType, id, actorId, 'Verification evidence changed; the previous human review was invalidated.']
    );
  }

  private async lockProductOwner(client: PoolClient, id: string, actorId: string): Promise<void> {
    const result = await client.query<{ owner_user_id: string }>(`SELECT owner_user_id FROM product_listings WHERE id=$1 FOR UPDATE`, [id]);
    if (!result.rows[0]) throw new NotFoundException('Media owner not found.');
    if (result.rows[0].owner_user_id !== actorId) throw new ForbiddenException('Access denied.');
  }

  private async invalidateProductReview(client: PoolClient, id: string): Promise<void> {
    await client.query(`UPDATE product_listings SET status='draft', moderation_status='pending', rejection_reason=NULL,
      updated_at=GREATEST(clock_timestamp(), updated_at + interval '1 microsecond') WHERE id=$1`, [id]);
  }

  private async assertOwner(actorId: string, ownerType: MediaAsset['ownerType'], ownerId: string): Promise<void> {
    if (ownerType === 'user') {
      if (ownerId !== actorId) throw new ForbiddenException('Access denied.');
      return;
    }
    const table = ownerType === 'business_profile' ? 'business_profiles' : ownerType === 'product_listing' ? 'product_listings' : 'professional_profiles';
    const ownerColumn = ownerType === 'professional_profile' ? 'user_identifier' : 'owner_user_id';
    const idColumn = ownerType === 'professional_profile' ? 'professional_profile_identifier' : 'id';
    const rows = await this.db.query<{ owner_user_id: string }>(`SELECT ${ownerColumn} AS owner_user_id FROM ${table} WHERE ${idColumn} = $1 LIMIT 1`, [ownerId]);
    if (!rows[0]) throw new NotFoundException('Media owner not found.');
    if (rows[0].owner_user_id !== actorId) throw new ForbiddenException('Access denied.');
  }

  private matchesMimeSignature(content: Buffer, mimeType: MediaAsset['mimeType']): boolean {
    if (mimeType === 'image/jpeg') return content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
    if (mimeType === 'image/png') return content.length >= 8 && content.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
    return content.length >= 12 && content.subarray(0, 4).toString('ascii') === 'RIFF' && content.subarray(8, 12).toString('ascii') === 'WEBP';
  }
}
