import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabasePool } from '../database/database.pool';
import { IdentityService } from '../identity/identity.service';
import { readSessionToken } from '../identity/session-cookie';
import { createStorageAdapter, type StorageAdapter } from '../media/storage.adapter';
import { OperationsRbacService } from '../operations-product/operations-rbac.service';
import type { AdListing } from './ad.types';
import {
  type AdImageMimeType,
  validateAdImageDelete,
  validateAdImageUpload
} from './ad-media.validation';

interface AdLockRow extends Record<string, unknown> {
  id: string;
  owner_user_id: string;
  status: AdListing['status'];
  revision: string | number;
  content_revision: string | number;
}

interface MediaRow extends Record<string, unknown> {
  id: string;
  owner_user_id: string;
  owner_id: string;
  filename: string;
  mime_type: AdImageMimeType;
  size_bytes: number;
  visibility: 'public' | 'private';
  storage_key: string;
  public_url: string | null;
  sort_order: number;
  created_at: Date;
}

interface ReceiptRow extends Record<string, unknown> {
  request_fingerprint: string;
  ad_id: string;
  result_revision: string | number;
}

export interface PublicAdImage {
  readonly id: string;
  readonly adId: string;
  readonly filename: string;
  readonly mimeType: AdImageMimeType;
  readonly sizeBytes: number;
  readonly publicUrl: string;
  readonly sortOrder: number;
  readonly createdAt: string;
}

@Injectable()
export class AdMediaService {
  private readonly storage: StorageAdapter;

  constructor(
    @Inject(DatabasePool) private readonly db: DatabasePool,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(OperationsRbacService) private readonly rbac: OperationsRbacService
  ) {
    this.storage = createStorageAdapter();
  }

  async upload(cookie: string | undefined, adId: string, body: unknown): Promise<{ adRevision: number; contentRevision: number; image: PublicAdImage }> {
    this.assertEnabled();
    const actor = await this.identity.getCurrentUser(readSessionToken(cookie));
    const input = validateAdImageUpload(body);
    const bytes = decodeAndValidateImage(input.content, input.sizeBytes, input.mimeType);
    const fingerprint = digest({
      operation: 'upload', adId, expectedContentRevision: input.expectedContentRevision, filename: input.filename,
      mimeType: input.mimeType, sizeBytes: input.sizeBytes, sortOrder: input.sortOrder, contentHash: createHash('sha256').update(bytes).digest('hex')
    });
    const imageId = digest(['ad-image-v1', actor.id, adId, input.clientRequestId]);
    const extension = input.mimeType === 'image/jpeg' ? 'jpg' : input.mimeType === 'image/png' ? 'png' : 'webp';
    const storageKey = `media/ad_listing/${adId}/${imageId}.${extension}`;

    return this.db.transaction(async (client) => {
      const ad = await this.requireMutableOwner(client, actor.id, adId, input.expectedContentRevision);
      const replay = await this.readReceipt(client, actor.id, input.clientRequestId, fingerprint);
      if (replay) {
        const image = await this.requireImage(client, imageId, actor.id, adId);
        const current = await this.requireAd(client, adId);
        return { adRevision: current.revision, contentRevision: current.contentRevision, image: toPublicImage(image) };
      }

      await this.storage.save(storageKey, bytes, input.mimeType);
      await client.query(
        `INSERT INTO media_assets
          (id,owner_user_id,owner_type,owner_id,filename,mime_type,size_bytes,visibility,storage_key,public_url,asset_type,sort_order,created_at,updated_at)
         VALUES ($1,$2,'ad_listing',$3,$4,$5,$6,'public',$7,$8,'ad_image',$9,clock_timestamp(),clock_timestamp())
         ON CONFLICT (id) DO NOTHING`,
        [imageId, actor.id, adId, input.filename, input.mimeType, input.sizeBytes, storageKey,
          `/api/v1/classifieds/media/public/${imageId}`, input.sortOrder]
      );
      const image = await this.requireImage(client, imageId, actor.id, adId);
      if (image.storage_key !== storageKey || image.mime_type !== input.mimeType || image.size_bytes !== input.sizeBytes || image.filename !== input.filename) {
        throw new ConflictException({ code: 'REQUEST_KEY_REBOUND' });
      }
      const next = await this.bumpContentRevision(client, ad);
      await this.recordReceipt(client, actor.id, input.clientRequestId, fingerprint, adId, next.revision);
      return { adRevision: next.revision, contentRevision: next.contentRevision, image: toPublicImage(image) };
    });
  }

  async remove(cookie: string | undefined, adId: string, mediaId: string, body: unknown): Promise<{ deleted: true; adRevision: number; contentRevision: number }> {
    this.assertEnabled();
    const actor = await this.identity.getCurrentUser(readSessionToken(cookie));
    const input = validateAdImageDelete(body);
    const fingerprint = digest({ operation: 'delete', adId, mediaId, expectedContentRevision: input.expectedContentRevision });
    let retiredStorageKey: string | undefined;

    const result = await this.db.transaction(async (client) => {
      const ad = await this.requireMutableOwner(client, actor.id, adId, input.expectedContentRevision);
      const replay = await this.readReceipt(client, actor.id, input.clientRequestId, fingerprint);
      if (replay) {
        const current = await this.requireAd(client, adId);
        return { deleted: true as const, adRevision: current.revision, contentRevision: current.contentRevision };
      }
      const image = await this.requireImage(client, mediaId, actor.id, adId);
      retiredStorageKey = image.storage_key;
      const removed = await client.query(
        `DELETE FROM media_assets WHERE id=$1 AND owner_user_id=$2 AND owner_type='ad_listing' AND owner_id=$3 AND asset_type='ad_image' RETURNING id`,
        [mediaId, actor.id, adId]
      );
      if (!removed.rowCount) throw new NotFoundException('Ad image was not found.');
      const next = await this.bumpContentRevision(client, ad);
      await this.recordReceipt(client, actor.id, input.clientRequestId, fingerprint, adId, next.revision);
      return { deleted: true as const, adRevision: next.revision, contentRevision: next.contentRevision };
    });

    if (retiredStorageKey) {
      try { await this.storage.delete(retiredStorageKey); }
      catch { /* Database removal is authoritative; object cleanup may be retried operationally. */ }
    }
    return result;
  }

  async listMine(cookie: string | undefined, adId: string): Promise<PublicAdImage[]> {
    this.assertEnabled();
    const actor = await this.identity.getCurrentUser(readSessionToken(cookie));
    const rows = await this.db.query<AdLockRow>(`SELECT id,owner_user_id,status,revision,content_revision FROM ad_listings WHERE id=$1`, [adId]);
    if (!rows[0] || rows[0].owner_user_id !== actor.id) throw new NotFoundException('Ad was not found.');
    return (await this.db.query<MediaRow>(
      `SELECT id,owner_user_id,owner_id,filename,mime_type,size_bytes,visibility,storage_key,public_url,sort_order,created_at
       FROM media_assets WHERE owner_type='ad_listing' AND owner_id=$1 AND asset_type='ad_image' ORDER BY sort_order,created_at,id`, [adId]
    )).map(toPublicImage);
  }

  async readPublic(mediaId: string): Promise<{ data: Buffer; mimeType: string }> {
    this.assertEnabled();
    const before = await this.readPublicMetadata(mediaId, false);
    const object = await this.storage.read(before.storage_key);
    const after = await this.readPublicMetadata(mediaId, false);
    if (after.storage_key !== before.storage_key || after.owner_id !== before.owner_id) throw new NotFoundException('Ad image was not found.');
    return { data: object.data, mimeType: after.mime_type || object.mimeType };
  }

  async readForReview(cookie: string | undefined, mediaId: string): Promise<{ data: Buffer; mimeType: string }> {
    this.assertEnabled();
    const actor = await this.identity.getCurrentUser(readSessionToken(cookie));
    this.rbac.assert(actor.email, 'security.manage');
    const before = await this.readPublicMetadata(mediaId, true);
    const object = await this.storage.read(before.storage_key);
    const after = await this.readPublicMetadata(mediaId, true);
    if (after.storage_key !== before.storage_key || after.owner_id !== before.owner_id) throw new NotFoundException('Ad image was not found.');
    return { data: object.data, mimeType: after.mime_type || object.mimeType };
  }

  private assertEnabled(): void {
    if (process.env.CLASSIFIEDS_ENABLED !== 'true') throw new ServiceUnavailableException('Classifieds are not enabled.');
  }

  private async requireMutableOwner(client: PoolClient, ownerUserId: string, adId: string, expectedContentRevision: number) {
    const ad = await this.requireAdLocked(client, adId);
    if (ad.ownerUserId !== ownerUserId) throw new NotFoundException('Ad was not found.');
    if (ad.contentRevision !== expectedContentRevision) throw new ConflictException({ code: 'CONTENT_REVISION_CONFLICT' });
    if (ad.status === 'pending_review' || ad.status === 'active') throw new ConflictException({ code: 'AD_MEDIA_LOCKED_FOR_REVIEW' });
    return ad;
  }

  private async requireAdLocked(client: PoolClient, adId: string) {
    const result = await client.query<AdLockRow>(
      `SELECT id,owner_user_id,status,revision,content_revision FROM ad_listings WHERE id=$1 FOR UPDATE`, [adId]
    );
    if (!result.rows[0]) throw new NotFoundException('Ad was not found.');
    return mapAd(result.rows[0]);
  }

  private async requireAd(client: PoolClient, adId: string) {
    const result = await client.query<AdLockRow>(
      `SELECT id,owner_user_id,status,revision,content_revision FROM ad_listings WHERE id=$1`, [adId]
    );
    if (!result.rows[0]) throw new NotFoundException('Ad was not found.');
    return mapAd(result.rows[0]);
  }

  private async bumpContentRevision(client: PoolClient, ad: ReturnType<typeof mapAd>) {
    const nextStatus = ad.status === 'rejected' || ad.status === 'expired' ? 'draft' : ad.status;
    const result = await client.query<AdLockRow>(
      `UPDATE ad_listings SET status=$2,rejection_reason=NULL,revision=revision+1,content_revision=content_revision+1,
         updated_at=GREATEST(clock_timestamp(),updated_at+interval '1 microsecond')
       WHERE id=$1 RETURNING id,owner_user_id,status,revision,content_revision`, [ad.id, nextStatus]
    );
    return mapAd(result.rows[0]);
  }

  private async readReceipt(client: PoolClient, ownerUserId: string, requestId: string, fingerprint: string): Promise<ReceiptRow | undefined> {
    const result = await client.query<ReceiptRow>(
      `SELECT request_fingerprint,ad_id,result_revision FROM ad_request_receipts WHERE owner_user_id=$1 AND action='media' AND request_id=$2`,
      [ownerUserId, requestId]
    );
    const row = result.rows[0];
    if (!row) return undefined;
    if (row.request_fingerprint !== fingerprint) throw new ConflictException({ code: 'REQUEST_KEY_REBOUND' });
    return row;
  }

  private async recordReceipt(client: PoolClient, ownerUserId: string, requestId: string, fingerprint: string, adId: string, resultRevision: number): Promise<void> {
    await client.query(
      `INSERT INTO ad_request_receipts(owner_user_id,action,request_id,request_fingerprint,ad_id,result_revision)
       VALUES($1,'media',$2,$3,$4,$5) ON CONFLICT(owner_user_id,action,request_id) DO NOTHING`,
      [ownerUserId, requestId, fingerprint, adId, resultRevision]
    );
    const row = await this.readReceipt(client, ownerUserId, requestId, fingerprint);
    if (!row || row.ad_id !== adId) throw new ConflictException({ code: 'REQUEST_KEY_REBOUND' });
  }

  private async requireImage(client: PoolClient, mediaId: string, ownerUserId: string, adId: string): Promise<MediaRow> {
    const result = await client.query<MediaRow>(
      `SELECT id,owner_user_id,owner_id,filename,mime_type,size_bytes,visibility,storage_key,public_url,sort_order,created_at
       FROM media_assets WHERE id=$1 AND owner_type='ad_listing' AND owner_id=$2 AND asset_type='ad_image'`, [mediaId, adId]
    );
    if (!result.rows[0] || result.rows[0].owner_user_id !== ownerUserId) throw new NotFoundException('Ad image was not found.');
    return result.rows[0];
  }

  private async readPublicMetadata(mediaId: string, reviewer: boolean): Promise<MediaRow> {
    const statusClause = reviewer ? "a.status IN ('pending_review','active','rejected')" : "a.status='active'";
    const rows = await this.db.query<MediaRow>(
      `SELECT m.id,m.owner_user_id,m.owner_id,m.filename,m.mime_type,m.size_bytes,m.visibility,m.storage_key,m.public_url,m.sort_order,m.created_at
       FROM media_assets m JOIN ad_listings a ON a.id=m.owner_id
       WHERE m.id=$1 AND m.owner_type='ad_listing' AND m.asset_type='ad_image' AND m.visibility='public'
         AND ${statusClause} AND (a.expires_at IS NULL OR a.expires_at>clock_timestamp())`, [mediaId]
    );
    if (!rows[0]) throw new NotFoundException('Ad image was not found.');
    return rows[0];
  }
}

function mapAd(row: AdLockRow) {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    status: row.status,
    revision: Number(row.revision),
    contentRevision: Number(row.content_revision)
  };
}

function toPublicImage(row: MediaRow): PublicAdImage {
  return {
    id: row.id,
    adId: row.owner_id,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    publicUrl: row.public_url ?? `/api/v1/classifieds/media/public/${row.id}`,
    sortOrder: row.sort_order,
    createdAt: row.created_at.toISOString()
  };
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function decodeAndValidateImage(encoded: string, expectedSize: number, mimeType: AdImageMimeType): Buffer {
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length !== expectedSize) throw new BadRequestException('Uploaded image content does not match its declared size.');
  const valid = mimeType === 'image/jpeg'
    ? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : mimeType === 'image/png'
      ? bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))
      : bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  if (!valid) throw new BadRequestException('Uploaded image content does not match its declared type.');
  return bytes;
}
