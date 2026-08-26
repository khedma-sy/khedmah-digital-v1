import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { IdentityService } from '../identity/identity.service';
import { readSessionToken } from '../identity/session-cookie';
import { createStorageAdapter, StorageAdapter } from './storage.adapter';
import { MediaAsset, PublicMediaAsset, UploadMediaRequest } from './media.types';
import { validateUploadMediaRequest } from './media.validation';

@Injectable()
export class MediaService {
  private readonly storage: StorageAdapter;

  constructor(
    @Inject(DatabasePool) private readonly db: DatabasePool,
    @Inject(IdentityService) private readonly identity: IdentityService
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

    const existing = input.ownerType === 'business_profile' && input.assetType
      ? await this.db.query<{ id: string; storage_key: string }>(
          `SELECT id, storage_key FROM media_assets WHERE owner_type = $1 AND owner_id = $2 AND asset_type = $3 ORDER BY created_at ASC`,
          [input.ownerType, input.ownerId, input.assetType]
        )
      : [];
    if (input.assetType === 'gallery' && existing.length >= 12) {
      throw new BadRequestException('Business gallery supports up to 12 images.');
    }

    const publicUrl = await this.storage.save(storageKey, content, input.mimeType);

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
      publicUrl: input.visibility === 'public' ? publicUrl : undefined,
      assetType: input.assetType,
      sortOrder: input.sortOrder,
      createdAt: now,
      updatedAt: now
    };

    await this.db.query(
      `INSERT INTO media_assets
         (id, owner_user_id, owner_type, owner_id, filename, mime_type,
          size_bytes, visibility, storage_key, public_url, asset_type, sort_order, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        asset.id, asset.ownerUserId, asset.ownerType, asset.ownerId,
        asset.filename, asset.mimeType, asset.sizeBytes, asset.visibility,
        asset.storageKey, asset.publicUrl ?? null, asset.assetType ?? null, asset.sortOrder, asset.createdAt, asset.updatedAt
      ]
    );

    if ((input.assetType === 'logo' || input.assetType === 'cover') && existing.length > 0) {
      await Promise.all(existing.map((item) => this.storage.delete(item.storage_key)));
      await this.db.query(
        `DELETE FROM media_assets WHERE owner_type = $1 AND owner_id = $2 AND asset_type = $3 AND id <> $4`,
        [input.ownerType, input.ownerId, input.assetType, asset.id]
      );
    }

    return this.toPublic(asset);
  }

  async listForOwner(cookieHeader: string | undefined, ownerType: string, ownerId: string): Promise<PublicMediaAsset[]> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
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

    return rows
      .filter((r) => r.visibility === 'public' || r.owner_user_id === actor.id)
      .map((r) => this.toPublic(this.mapRow(r)));
  }

  async delete(cookieHeader: string | undefined, id: string): Promise<void> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const rows = await this.db.query<{ owner_user_id: string; storage_key: string }>(
      `SELECT owner_user_id, storage_key FROM media_assets WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (!rows[0]) throw new NotFoundException('Media asset not found.');
    if (rows[0].owner_user_id !== actor.id) throw new ForbiddenException('Access denied.');

    await this.storage.delete(rows[0].storage_key);
    await this.db.query(`DELETE FROM media_assets WHERE id = $1`, [id]);
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

  private async assertOwner(actorId: string, ownerType: MediaAsset['ownerType'], ownerId: string): Promise<void> {
    if (ownerType === 'user') {
      if (ownerId !== actorId) throw new ForbiddenException('Access denied.');
      return;
    }
    const table = ownerType === 'business_profile' ? 'business_profiles' : 'professional_profiles';
    const ownerColumn = ownerType === 'business_profile' ? 'owner_user_id' : 'user_identifier';
    const idColumn = ownerType === 'business_profile' ? 'id' : 'professional_profile_identifier';
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
