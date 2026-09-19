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
          const current = await client.query<{ id: string; storage_key: string }>(
            `SELECT id,storage_key FROM media_assets WHERE owner_type=$1 AND owner_id=$2 AND asset_type=$3 ORDER BY created_at,id`, [input.ownerType,input.ownerId,input.assetType ?? null]);
          if (input.assetType === 'gallery' && current.rows.length >= 12) throw new BadRequestException('يمكن رفع 12 صورة كحد أقصى.');
          await client.query(insertSql, insertValues);
          const replaced = input.assetType === 'logo' || input.assetType === 'cover';
          if (replaced) await client.query(`DELETE FROM media_assets WHERE owner_type=$1 AND owner_id=$2 AND asset_type=$3 AND id<>$4`, [input.ownerType,input.ownerId,input.assetType,asset.id]);
          await this.invalidateProfileReview(client, input.ownerType as 'business_profile' | 'professional_profile', input.ownerId);
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
    const rows = await this.db.query<{ owner_user_id: string; storage_key: string; owner_type: string; owner_id: string }>(
      `SELECT owner_user_id, storage_key, owner_type, owner_id FROM media_assets WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (!rows[0]) throw new NotFoundException('Media asset not found.');
    if (rows[0].owner_user_id !== actor.id) throw new ForbiddenException('Access denied.');

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
      await this.db.transaction(async (client) => {
        await this.lockProfileOwner(client, ownerType, ownerId, actor.id);
        const removed = await client.query(`DELETE FROM media_assets WHERE id=$1 AND owner_user_id=$2 RETURNING id`, [id,actor.id]);
        if (!removed.rowCount) throw new NotFoundException('Media asset not found.');
        await this.invalidateProfileReview(client, ownerType, ownerId);
      });
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
    if (current.storage_key !== asset.storage_key || current.owner_type !== asset.owner_type || current.owner_id !== asset.owner_id) {
      throw new NotFoundException('Media asset not found.');
    }
    await this.assertAssetReadable(current, cookieHeader);
    return { data: object.data, mimeType: current.mime_type || object.mimeType };
  }

  private async readAssetMetadata(id: string) {
    const rows = await this.db.query<{ storage_key: string; mime_type: string; owner_type: MediaAsset['ownerType']; owner_id: string; visibility: string }>(
      `SELECT storage_key,mime_type,owner_type,owner_id,visibility FROM media_assets WHERE id=$1 LIMIT 1`, [id]);
    if (!rows[0]) throw new NotFoundException('Media asset not found.');
    return rows[0];
  }

  private async assertAssetReadable(asset: { owner_type: MediaAsset['ownerType']; owner_id: string; visibility: string }, cookieHeader?: string): Promise<void> {
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
    if (asset.visibility === 'public' && ['business_profile','professional_profile','product_listing'].includes(asset.owner_type)) {
      try { this.rbac.assert(actor.email, 'security.manage'); return; }
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

  private async invalidateProfileReview(client: PoolClient, ownerType: 'business_profile' | 'professional_profile', id: string): Promise<void> {
    const table = ownerType === 'business_profile' ? 'business_profiles' : 'professional_profiles';
    const idColumn = ownerType === 'business_profile' ? 'id' : 'professional_profile_identifier';
    await client.query(`UPDATE ${table} SET moderation_status=CASE WHEN moderation_status='suspended' THEN 'suspended' ELSE 'pending' END,
      updated_at=GREATEST(clock_timestamp(),updated_at+interval '1 microsecond') WHERE ${idColumn}=$1`, [id]);
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
