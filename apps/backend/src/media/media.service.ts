import { randomUUID } from 'node:crypto';
import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
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

    const content = Buffer.from(input.content, 'base64');
    const id = randomUUID();
    const ext = input.mimeType.split('/')[1];
    const storageKey = `media/${input.ownerType}/${input.ownerId}/${id}.${ext}`;
    const now = new Date().toISOString();

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
      createdAt: now,
      updatedAt: now
    };

    await this.db.query(
      `INSERT INTO media_assets
         (id, owner_user_id, owner_type, owner_id, filename, mime_type,
          size_bytes, visibility, storage_key, public_url, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        asset.id, asset.ownerUserId, asset.ownerType, asset.ownerId,
        asset.filename, asset.mimeType, asset.sizeBytes, asset.visibility,
        asset.storageKey, asset.publicUrl ?? null, asset.createdAt, asset.updatedAt
      ]
    );

    return this.toPublic(asset);
  }

  async listForOwner(cookieHeader: string | undefined, ownerType: string, ownerId: string): Promise<PublicMediaAsset[]> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const rows = await this.db.query<{
      id: string; owner_user_id: string; owner_type: string; owner_id: string;
      filename: string; mime_type: string; size_bytes: number; visibility: string;
      storage_key: string; public_url: string | null; created_at: Date; updated_at: Date;
    }>(
      `SELECT id, owner_user_id, owner_type, owner_id, filename, mime_type,
              size_bytes, visibility, storage_key, public_url, created_at, updated_at
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
      createdAt: asset.createdAt
    };
  }

  private mapRow(r: {
    id: string; owner_user_id: string; owner_type: string; owner_id: string;
    filename: string; mime_type: string; size_bytes: number; visibility: string;
    storage_key: string; public_url: string | null; created_at: Date; updated_at: Date;
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
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString()
    };
  }
}
