import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { IdentityService } from '../identity/identity.service';
import { readSessionToken } from '../identity/session-cookie';
import { OperationsRbacService } from '../operations-product/operations-rbac.service';
import { createStorageAdapter, StorageAdapter } from './storage.adapter';
import { DocumentReviewStatus, MediaAsset, PublicMediaAsset, UploadMediaRequest } from './media.types';
import { validateUploadMediaRequest } from './media.validation';

const DRIVER_DOCUMENT_TYPES = new Set(['driver_photo','identity_card','driving_license','vehicle_license']);

@Injectable()
export class MediaService {
  private readonly storage: StorageAdapter;

  constructor(
    @Inject(DatabasePool) private readonly db: DatabasePool,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(OperationsRbacService) private readonly rbac: OperationsRbacService
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

    const imageLimit = input.assetType === 'gallery' ? 12 : input.assetType === 'product_image' ? 5 : ['problem_image','completion_image'].includes(input.assetType ?? '') ? 5 : ['driver_photo','identity_card','driving_license','vehicle_license'].includes(input.assetType ?? '') ? 1 : undefined;
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

    if (imageLimit !== undefined) {
      let stored = false;
      try {
        await this.db.transaction(async (client) => {
          await client.query(
            `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
            [`${input.ownerType}:${input.ownerId}:${input.assetType}`]
          );
          const countResult = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count FROM media_assets WHERE owner_type = $1 AND owner_id = $2 AND asset_type = $3`,
            [input.ownerType, input.ownerId, input.assetType]
          );
          if (Number(countResult.rows[0]?.count ?? 0) >= imageLimit) {
            throw new BadRequestException(`يمكن رفع ${imageLimit} صورة كحد أقصى.`);
          }

          await this.storage.save(storageKey, content, input.mimeType);
          stored = true;
          await client.query(
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
          if (input.ownerType === 'business_profile' && DRIVER_DOCUMENT_TYPES.has(input.assetType ?? '')) {
            await client.query(
              `INSERT INTO mobility_document_reviews
                 (media_asset_id, business_profile_id, document_type, status, created_at, updated_at)
               VALUES ($1,$2,$3,'pending',$4,$4)`,
              [asset.id, asset.ownerId, asset.assetType, asset.createdAt]
            );
          }
        });
      } catch (error) {
        if (stored) await this.storage.delete(storageKey).catch(() => undefined);
        throw error;
      }
      return this.toPublic(asset);
    }

    const existing = (input.ownerType === 'business_profile' || input.ownerType === 'product_listing' || input.ownerType === 'professional_request') && input.assetType
      ? await this.db.query<{ id: string; storage_key: string }>(
          `SELECT id, storage_key FROM media_assets WHERE owner_type = $1 AND owner_id = $2 AND asset_type = $3 ORDER BY created_at ASC`,
          [input.ownerType, input.ownerId, input.assetType]
        )
      : [];

    await this.storage.save(storageKey, content, input.mimeType);

    try {
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
    } catch (error) {
      await this.storage.delete(storageKey).catch(() => undefined);
      throw error;
    }

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
    const canReadPrivateRequest = ownerType === 'professional_request' ? await this.canReadProfessionalRequest(actor.id, ownerId) : false;
    const canReviewDriverDocuments = ownerType === 'business_profile' && this.rbac.permissionsFor(actor.email).includes('security.manage');
    const rows = await this.db.query<{
      id: string; owner_user_id: string; owner_type: string; owner_id: string;
      filename: string; mime_type: string; size_bytes: number; visibility: string;
      storage_key: string; public_url: string | null; asset_type: string | null; sort_order: number; created_at: Date; updated_at: Date;
      document_review_status: DocumentReviewStatus | null; document_review_reason: string | null; document_reviewed_at: Date | null;
    }>(
      `SELECT m.id, m.owner_user_id, m.owner_type, m.owner_id, m.filename, m.mime_type,
              m.size_bytes, m.visibility, m.storage_key, m.public_url, m.asset_type, m.sort_order, m.created_at, m.updated_at,
              r.status AS document_review_status, r.review_reason AS document_review_reason, r.reviewed_at AS document_reviewed_at
       FROM media_assets m
       LEFT JOIN mobility_document_reviews r ON r.media_asset_id = m.id
       WHERE m.owner_type = $1 AND m.owner_id = $2`,
      [ownerType, ownerId]
    );

    return rows
      .filter((r) => r.visibility === 'public' || r.owner_user_id === actor.id || canReadPrivateRequest || (canReviewDriverDocuments && DRIVER_DOCUMENT_TYPES.has(r.asset_type ?? '')))
      .map((r) => {
        const asset=this.toPublic(this.mapRow(r));
        return {
          ...asset,
          ...(r.visibility === 'private' ? {publicUrl:`/api/v1/media/secure/${r.id}`} : {}),
          ...(r.document_review_status ? {
            documentReviewStatus:r.document_review_status,
            documentReviewReason:r.document_review_reason ?? undefined,
            documentReviewedAt:r.document_reviewed_at?.toISOString()
          } : {})
        };
      });
  }

  async reviewDriverDocument(cookieHeader:string|undefined,id:string,status:unknown,reason:unknown):Promise<{id:string;status:DocumentReviewStatus;reason?:string;reviewedAt:string}>{
    const actor=await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    this.rbac.assert(actor.email,'security.manage');
    if(status!=='approved'&&status!=='rejected')throw new BadRequestException('Document review status is invalid.');
    const normalizedReason=typeof reason==='string'&&reason.trim()?reason.trim():undefined;
    if(status==='rejected'&&(!normalizedReason||normalizedReason.length<5))throw new BadRequestException('A rejection reason of at least five characters is required.');
    const reviewedAt=new Date().toISOString();
    return this.db.transaction(async client=>{
      const locked=await client.query<{owner_id:string;asset_type:string}>(
        `SELECT owner_id,asset_type FROM media_assets
         WHERE id=$1 AND owner_type='business_profile' AND visibility='private'
           AND asset_type IN ('driver_photo','identity_card','driving_license','vehicle_license')
         FOR UPDATE`,[id]);
      const document=locked.rows[0];
      if(!document)throw new NotFoundException('Driver document was not found.');
      await client.query(
        `INSERT INTO mobility_document_reviews
           (media_asset_id,business_profile_id,document_type,status,review_reason,reviewed_by,reviewed_at,created_at,updated_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$7,$7)
         ON CONFLICT(media_asset_id) DO UPDATE SET status=EXCLUDED.status,review_reason=EXCLUDED.review_reason,
           reviewed_by=EXCLUDED.reviewed_by,reviewed_at=EXCLUDED.reviewed_at,updated_at=EXCLUDED.updated_at`,
        [id,document.owner_id,document.asset_type,status,status==='rejected'?normalizedReason:null,actor.id,reviewedAt]);
      await client.query(
        `INSERT INTO mobility_document_review_events
           (id,media_asset_id,business_profile_id,document_type,status,review_reason,actor_user_id,created_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [randomUUID(),id,document.owner_id,document.asset_type,status,status==='rejected'?normalizedReason:null,actor.id,reviewedAt]);
      if(status==='rejected'){
        await client.query(
          `UPDATE business_profiles
           SET visibility='private',moderation_status='pending',trust_status='pending',updated_at=$2
           WHERE id=$1 AND category_code IN ('taxi','delivery_courier')`,
          [document.owner_id,reviewedAt]);
      }
      return{id,status,reason:status==='rejected'?normalizedReason:undefined,reviewedAt};
    });
  }

  async delete(cookieHeader: string | undefined, id: string): Promise<void> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const rows = await this.db.query<{ owner_user_id: string; owner_type:string; owner_id:string; asset_type:string|null; storage_key: string }>(
      `SELECT owner_user_id,owner_type,owner_id,asset_type,storage_key FROM media_assets WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (!rows[0]) throw new NotFoundException('Media asset not found.');
    if (rows[0].owner_user_id !== actor.id) throw new ForbiddenException('Access denied.');

    await this.storage.delete(rows[0].storage_key);
    await this.db.transaction(async(client)=>{
      await client.query(`DELETE FROM media_assets WHERE id = $1`, [id]);
      if(rows[0].owner_type==='business_profile'&&DRIVER_DOCUMENT_TYPES.has(rows[0].asset_type??'')){
        await client.query(
          `UPDATE business_profiles
           SET visibility='private',moderation_status='pending',trust_status='pending',updated_at=NOW()
           WHERE id=$1 AND category_code IN ('taxi','delivery_courier')`,
          [rows[0].owner_id]);
      }
    });
  }

  async readPublic(id: string): Promise<{ data: Buffer; mimeType: string }> {
    const rows = await this.db.query<{ storage_key: string; mime_type: string }>(
      `SELECT storage_key, mime_type FROM media_assets WHERE id = $1 AND visibility = 'public' LIMIT 1`,
      [id]
    );
    if (!rows[0]) throw new NotFoundException('Public media asset not found.');
    const object = await this.storage.read(rows[0].storage_key);
    return { data: object.data, mimeType: rows[0].mime_type || object.mimeType };
  }

  async readSecure(cookieHeader:string|undefined,id:string):Promise<{data:Buffer;mimeType:string}>{
    const actor=await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const [row]=await this.db.query<{storage_key:string;mime_type:string;owner_type:string;owner_id:string;owner_user_id:string;asset_type:string|null}>(`SELECT storage_key,mime_type,owner_type,owner_id,owner_user_id,asset_type FROM media_assets WHERE id=$1 AND visibility='private' LIMIT 1`,[id]);
    if(!row)throw new NotFoundException('Media asset not found.');
    const allowed=row.owner_user_id===actor.id||(row.owner_type==='professional_request'&&await this.canReadProfessionalRequest(actor.id,row.owner_id))||(row.owner_type==='business_profile'&&DRIVER_DOCUMENT_TYPES.has(row.asset_type??'')&&this.rbac.permissionsFor(actor.email).includes('security.manage'));
    if(!allowed)throw new ForbiddenException('Access denied.');const object=await this.storage.read(row.storage_key);return{data:object.data,mimeType:row.mime_type||object.mimeType};
  }

  private async canReadProfessionalRequest(actorId:string,requestId:string){const [r]=await this.db.query<{allowed:boolean}>(`SELECT EXISTS(SELECT 1 FROM professional_service_requests r WHERE r.id=$1 AND (r.customer_user_id=$2 OR EXISTS(SELECT 1 FROM business_profiles b WHERE b.owner_user_id=$2 AND b.category_code=r.category_code AND b.visibility='public' AND b.moderation_status='approved' AND b.trust_status='approved'))) allowed`,[requestId,actorId]);return !!r?.allowed;}

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
    if (ownerType === 'professional_request') {
      const rows = await this.db.query<{ owner_user_id: string }>(`SELECT customer_user_id AS owner_user_id FROM professional_service_requests WHERE id=$1 LIMIT 1`,[ownerId]);
      if (!rows[0]) throw new NotFoundException('Media owner not found.');
      if (rows[0].owner_user_id !== actorId) throw new ForbiddenException('Access denied.');
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
