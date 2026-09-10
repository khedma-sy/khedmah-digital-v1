import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { DatabasePool } from '../database/database.pool';
import type { AdContentInput, AdContentPatch, AdListing } from './ad.types';

interface AdRow extends Record<string, unknown> {
  id: string;
  owner_user_id: string;
  business_profile_id: string | null;
  kind: AdListing['kind'];
  title_ar: string;
  description_ar: string | null;
  category_code: string;
  price_mode: AdListing['priceMode'];
  price_minor: string | number | null;
  currency: 'SYP' | 'USD' | null;
  city_code: string | null;
  area_text: string | null;
  contact_mode: AdListing['contactMode'];
  contact_value: string | null;
  status: AdListing['status'];
  rejection_reason: string | null;
  revision: string | number;
  content_revision: string | number;
  review_revision: string | number;
  expires_at: Date | null;
  submitted_at: Date | null;
  created_at: Date;
  updated_at: Date;
  image_urls: string[] | null;
}

interface ReceiptRow extends Record<string, unknown> {
  request_fingerprint: string;
  ad_id: string;
  result_revision: string | number;
}

export type AdReceiptAction = 'create' | 'update' | 'submit' | 'deactivate' | 'reactivate';

const projection = `a.id,a.owner_user_id,a.business_profile_id,a.kind,a.title_ar,a.description_ar,a.category_code,
  a.price_mode,a.price_minor,a.currency,a.city_code,a.area_text,a.contact_mode,a.contact_value,a.status,a.rejection_reason,
  a.revision,a.content_revision,a.review_revision,a.expires_at,a.submitted_at,a.created_at,a.updated_at,
  (SELECT COALESCE(array_agg(m.public_url ORDER BY m.sort_order,m.created_at) FILTER (WHERE m.public_url IS NOT NULL),ARRAY[]::text[])
     FROM media_assets m WHERE m.owner_type='ad_listing' AND m.owner_id=a.id AND m.asset_type='ad_image' AND m.visibility='public') AS image_urls`;

@Injectable()
export class AdRepository {
  constructor(@Inject(DatabasePool) private readonly db: DatabasePool) {}

  async create(ownerUserId: string, id: string, requestId: string, fingerprint: string, input: AdContentInput): Promise<AdListing> {
    return this.db.transaction(async (client) => {
      const replay = await this.readReplay(client, ownerUserId, 'create', requestId, fingerprint);
      if (replay) return replay;
      await this.assertActiveCategory(client, input.categoryCode);
      await this.assertBusinessOwner(client, input.businessProfileId, ownerUserId);
      await client.query(
        `INSERT INTO ad_listings
          (id,owner_user_id,business_profile_id,kind,title_ar,description_ar,category_code,price_mode,price_minor,currency,
           city_code,area_text,contact_mode,contact_value,status,rejection_reason,expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'draft',NULL,$15)
         ON CONFLICT (id) DO NOTHING`,
        [id, ownerUserId, input.businessProfileId ?? null, input.kind, input.titleAr, input.descriptionAr ?? null, input.categoryCode,
          input.priceMode, input.priceMinor ?? null, input.currency ?? null, input.cityCode ?? null, input.areaText ?? null,
          input.contactMode, input.contactValue ?? null, input.expiresAt ?? null]
      );
      const ad = await this.requireById(client, id);
      this.assertCreateCompatible(ad, ownerUserId, input);
      await this.recordReceipt(client, ownerUserId, 'create', requestId, fingerprint, ad.id, ad.revision);
      return ad;
    });
  }

  async update(ownerUserId: string, id: string, requestId: string, fingerprint: string,
    expectedContentRevision: number, patch: AdContentPatch): Promise<AdListing> {
    return this.db.transaction(async (client) => {
      const ad = await this.requireOwnerLocked(client, ownerUserId, id);
      const replay = await this.readReplay(client, ownerUserId, 'update', requestId, fingerprint);
      if (replay) return replay;
      if (ad.contentRevision !== expectedContentRevision) throw new ConflictException({ code: 'CONTENT_REVISION_CONFLICT' });
      if (ad.status === 'active' || ad.status === 'pending_review') throw new ConflictException({ code: 'AD_EDIT_REQUIRES_WITHDRAWAL' });

      const next: AdContentInput = {
        businessProfileId: Object.prototype.hasOwnProperty.call(patch, 'businessProfileId') ? patch.businessProfileId : ad.businessProfileId,
        kind: patch.kind ?? ad.kind,
        titleAr: patch.titleAr ?? ad.titleAr,
        descriptionAr: Object.prototype.hasOwnProperty.call(patch, 'descriptionAr') ? patch.descriptionAr : ad.descriptionAr,
        categoryCode: patch.categoryCode ?? ad.categoryCode,
        priceMode: patch.priceMode ?? ad.priceMode,
        priceMinor: Object.prototype.hasOwnProperty.call(patch, 'priceMinor') ? patch.priceMinor : ad.priceMinor,
        currency: Object.prototype.hasOwnProperty.call(patch, 'currency') ? patch.currency : ad.currency,
        cityCode: Object.prototype.hasOwnProperty.call(patch, 'cityCode') ? patch.cityCode : ad.cityCode,
        areaText: Object.prototype.hasOwnProperty.call(patch, 'areaText') ? patch.areaText : ad.areaText,
        contactMode: patch.contactMode ?? ad.contactMode,
        contactValue: Object.prototype.hasOwnProperty.call(patch, 'contactValue') ? patch.contactValue : ad.contactValue,
        expiresAt: Object.prototype.hasOwnProperty.call(patch, 'expiresAt') ? patch.expiresAt : ad.expiresAt
      };
      this.assertContentContracts(next);
      await this.assertActiveCategory(client, next.categoryCode);
      await this.assertBusinessOwner(client, next.businessProfileId, ownerUserId);
      const status = ad.status === 'rejected' || ad.status === 'expired' ? 'draft' : ad.status;
      await client.query(
        `UPDATE ad_listings SET business_profile_id=$3,kind=$4,title_ar=$5,description_ar=$6,category_code=$7,
          price_mode=$8,price_minor=$9,currency=$10,city_code=$11,area_text=$12,contact_mode=$13,contact_value=$14,
          status=$15,rejection_reason=NULL,expires_at=$16,revision=revision+1,content_revision=content_revision+1,
          updated_at=GREATEST(clock_timestamp(),updated_at+interval '1 microsecond')
         WHERE id=$1 AND owner_user_id=$2`,
        [id, ownerUserId, next.businessProfileId ?? null, next.kind, next.titleAr, next.descriptionAr ?? null, next.categoryCode,
          next.priceMode, next.priceMinor ?? null, next.currency ?? null, next.cityCode ?? null, next.areaText ?? null,
          next.contactMode, next.contactValue ?? null, status, next.expiresAt ?? null]
      );
      const saved = await this.requireById(client, id);
      await this.recordReceipt(client, ownerUserId, 'update', requestId, fingerprint, saved.id, saved.revision);
      return saved;
    });
  }

  async submit(ownerUserId: string, id: string, requestId: string, fingerprint: string): Promise<AdListing> {
    return this.db.transaction(async (client) => {
      const ad = await this.requireOwnerLocked(client, ownerUserId, id);
      const replay = await this.readReplay(client, ownerUserId, 'submit', requestId, fingerprint);
      if (replay) return replay;
      if (!['draft', 'inactive', 'rejected'].includes(ad.status)) throw new ConflictException({ code: 'AD_NOT_SUBMITTABLE' });
      if (ad.expiresAt && !await this.isFuture(client, ad.expiresAt)) throw new BadRequestException({ code: 'AD_EXPIRY_INVALID' });

      const existingSlot = await client.query(`SELECT ad_id FROM ad_free_slots WHERE ad_id=$1 AND owner_user_id=$2`, [id, ownerUserId]);
      if (!existingSlot.rowCount) {
        await client.query(`INSERT INTO ad_free_slots(ad_id,owner_user_id) VALUES($1,$2)`, [id, ownerUserId]);
      }
      await client.query(
        `UPDATE ad_listings SET status='pending_review',rejection_reason=NULL,review_revision=review_revision+1,revision=revision+1,
          submitted_at=clock_timestamp(),updated_at=GREATEST(clock_timestamp(),updated_at+interval '1 microsecond')
         WHERE id=$1 AND owner_user_id=$2`, [id, ownerUserId]
      );
      const saved = await this.requireById(client, id);
      await this.recordReceipt(client, ownerUserId, 'submit', requestId, fingerprint, saved.id, saved.revision);
      return saved;
    });
  }

  async deactivate(ownerUserId: string, id: string, requestId: string, fingerprint: string, expectedRevision: number): Promise<AdListing> {
    return this.db.transaction(async (client) => {
      const ad = await this.requireOwnerLocked(client, ownerUserId, id);
      const replay = await this.readReplay(client, ownerUserId, 'deactivate', requestId, fingerprint);
      if (replay) return replay;
      if (ad.revision !== expectedRevision) throw new ConflictException({ code: 'REVISION_CONFLICT' });
      if (ad.status !== 'active') throw new ConflictException({ code: 'AD_NOT_ACTIVE' });
      await client.query(`UPDATE ad_listings SET status='inactive',revision=revision+1,
        updated_at=GREATEST(clock_timestamp(),updated_at+interval '1 microsecond') WHERE id=$1 AND owner_user_id=$2`, [id, ownerUserId]);
      const saved = await this.requireById(client, id);
      await this.recordReceipt(client, ownerUserId, 'deactivate', requestId, fingerprint, saved.id, saved.revision);
      return saved;
    });
  }

  async reactivate(ownerUserId: string, id: string, requestId: string, fingerprint: string, expectedRevision: number): Promise<AdListing> {
    return this.db.transaction(async (client) => {
      const ad = await this.requireOwnerLocked(client, ownerUserId, id);
      const replay = await this.readReplay(client, ownerUserId, 'reactivate', requestId, fingerprint);
      if (replay) return replay;
      if (ad.revision !== expectedRevision) throw new ConflictException({ code: 'REVISION_CONFLICT' });
      if (ad.status !== 'inactive') throw new ConflictException({ code: 'AD_NOT_INACTIVE' });
      if (ad.expiresAt && !await this.isFuture(client, ad.expiresAt)) throw new BadRequestException({ code: 'AD_EXPIRY_INVALID' });
      await client.query(`UPDATE ad_listings SET status='pending_review',review_revision=review_revision+1,revision=revision+1,
        submitted_at=clock_timestamp(),updated_at=GREATEST(clock_timestamp(),updated_at+interval '1 microsecond')
        WHERE id=$1 AND owner_user_id=$2`, [id, ownerUserId]);
      const saved = await this.requireById(client, id);
      await this.recordReceipt(client, ownerUserId, 'reactivate', requestId, fingerprint, saved.id, saved.revision);
      return saved;
    });
  }

  async moderate(reviewerUserId: string, id: string, expectedReviewRevision: number,
    decision: 'approved' | 'rejected', reason?: string): Promise<AdListing> {
    return this.db.transaction(async (client) => {
      const ad = await this.requireLocked(client, id);
      if (ad.status !== 'pending_review' || ad.reviewRevision !== expectedReviewRevision) {
        throw new ConflictException({ code: 'REVIEW_REVISION_CONFLICT' });
      }
      if (decision === 'approved') {
        if (ad.expiresAt && !await this.isFuture(client, ad.expiresAt)) throw new ConflictException({ code: 'AD_EXPIRED_BEFORE_APPROVAL' });
        await this.assertBusinessPublishable(client, ad.businessProfileId);
      }
      const nextStatus = decision === 'approved' ? 'active' : 'rejected';
      await client.query(`UPDATE ad_listings SET status=$2,rejection_reason=$3,revision=revision+1,
        updated_at=GREATEST(clock_timestamp(),updated_at+interval '1 microsecond') WHERE id=$1`,
      [id, nextStatus, decision === 'rejected' ? reason ?? null : null]);
      await client.query(`INSERT INTO ad_moderation_events
        (id,ad_id,reviewer_user_id,review_revision,content_revision,decision,reason)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [randomUUID(), id, reviewerUserId, ad.reviewRevision, ad.contentRevision, decision, decision === 'rejected' ? reason ?? null : null]);
      return this.requireById(client, id);
    });
  }

  async findMine(ownerUserId: string, id: string): Promise<AdListing | undefined> {
    const rows = await this.db.query<AdRow>(`SELECT ${projection} FROM ad_listings a WHERE a.id=$1 AND a.owner_user_id=$2`, [id, ownerUserId]);
    return rows[0] ? map(rows[0]) : undefined;
  }

  async findPublicById(id: string): Promise<AdListing | undefined> {
    const rows = await this.db.query<AdRow>(`SELECT ${projection} FROM ad_listings a
      WHERE a.id=$1 AND a.status='active' AND (a.expires_at IS NULL OR a.expires_at>clock_timestamp())
        AND (a.business_profile_id IS NULL OR EXISTS(SELECT 1 FROM business_profiles b WHERE b.id=a.business_profile_id
          AND b.visibility='public' AND b.moderation_status='approved' AND b.trust_status='approved' AND b.status='active'))`, [id]);
    return rows[0] ? map(rows[0]) : undefined;
  }

  async listMine(ownerUserId: string): Promise<AdListing[]> {
    return (await this.db.query<AdRow>(`SELECT ${projection} FROM ad_listings a WHERE a.owner_user_id=$1 ORDER BY a.created_at DESC LIMIT 200`, [ownerUserId])).map(map);
  }

  async listPublic(filters: { q?: string; categoryCode?: string; cityCode?: string }): Promise<AdListing[]> {
    const clauses = ["a.status='active'", "(a.expires_at IS NULL OR a.expires_at>clock_timestamp())",
      "(a.business_profile_id IS NULL OR EXISTS(SELECT 1 FROM business_profiles b WHERE b.id=a.business_profile_id AND b.visibility='public' AND b.moderation_status='approved' AND b.trust_status='approved' AND b.status='active'))"];
    const params: unknown[] = [];
    if (filters.q) {
      params.push(`%${escapeLike(filters.q)}%`);
      clauses.push(`(a.title_ar ILIKE $${params.length} ESCAPE '\\' OR COALESCE(a.description_ar,'') ILIKE $${params.length} ESCAPE '\\')`);
    }
    if (filters.categoryCode) {
      params.push(filters.categoryCode);
      clauses.push(`a.category_code IN (WITH RECURSIVE category_tree AS (
        SELECT code FROM categories WHERE code=$${params.length} AND status='active'
        UNION ALL SELECT child.code FROM categories child JOIN category_tree parent ON child.parent_code=parent.code WHERE child.status='active'
      ) SELECT code FROM category_tree)`);
    }
    if (filters.cityCode) {
      params.push(filters.cityCode);
      clauses.push(`a.city_code=$${params.length}`);
    }
    return (await this.db.query<AdRow>(`SELECT ${projection} FROM ad_listings a WHERE ${clauses.join(' AND ')} ORDER BY a.created_at DESC LIMIT 100`, params)).map(map);
  }

  async listPending(): Promise<AdListing[]> {
    return (await this.db.query<AdRow>(`SELECT ${projection} FROM ad_listings a WHERE a.status='pending_review' ORDER BY a.submitted_at ASC,a.updated_at ASC LIMIT 200`)).map(map);
  }

  async quota(ownerUserId: string): Promise<{ used: number; limit: 3 }> {
    const rows = await this.db.query<{ count: number }>(`SELECT count(*)::int AS count FROM ad_free_slots WHERE owner_user_id=$1`, [ownerUserId]);
    return { used: rows[0]?.count ?? 0, limit: 3 };
  }

  private async readReplay(client: PoolClient, ownerUserId: string, action: AdReceiptAction, requestId: string, fingerprint: string): Promise<AdListing | undefined> {
    const result = await client.query<ReceiptRow>(`SELECT request_fingerprint,ad_id,result_revision FROM ad_request_receipts
      WHERE owner_user_id=$1 AND action=$2 AND request_id=$3`, [ownerUserId, action, requestId]);
    const receipt = result.rows[0];
    if (!receipt) return undefined;
    if (receipt.request_fingerprint !== fingerprint) throw new ConflictException({ code: 'REQUEST_KEY_REBOUND' });
    const ad = await this.requireById(client, receipt.ad_id);
    if (ad.ownerUserId !== ownerUserId) throw new ForbiddenException('Access denied.');
    return ad;
  }

  private async recordReceipt(client: PoolClient, ownerUserId: string, action: AdReceiptAction, requestId: string,
    fingerprint: string, adId: string, resultRevision: number): Promise<void> {
    await client.query(`INSERT INTO ad_request_receipts(owner_user_id,action,request_id,request_fingerprint,ad_id,result_revision)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(owner_user_id,action,request_id) DO NOTHING`,
    [ownerUserId, action, requestId, fingerprint, adId, resultRevision]);
    const result = await client.query<ReceiptRow>(`SELECT request_fingerprint,ad_id,result_revision FROM ad_request_receipts
      WHERE owner_user_id=$1 AND action=$2 AND request_id=$3`, [ownerUserId, action, requestId]);
    const receipt = result.rows[0];
    if (!receipt || receipt.request_fingerprint !== fingerprint || receipt.ad_id !== adId) {
      throw new ConflictException({ code: 'REQUEST_KEY_REBOUND' });
    }
  }

  private async requireOwnerLocked(client: PoolClient, ownerUserId: string, id: string): Promise<AdListing> {
    const ad = await this.requireLocked(client, id);
    if (ad.ownerUserId !== ownerUserId) throw new NotFoundException('Ad was not found.');
    return ad;
  }

  private async requireLocked(client: PoolClient, id: string): Promise<AdListing> {
    await client.query(`SELECT id FROM ad_listings WHERE id=$1 FOR UPDATE`, [id]);
    return this.requireById(client, id);
  }

  private async requireById(client: PoolClient, id: string): Promise<AdListing> {
    const result = await client.query<AdRow>(`SELECT ${projection} FROM ad_listings a WHERE a.id=$1`, [id]);
    if (!result.rows[0]) throw new NotFoundException('Ad was not found.');
    return map(result.rows[0]);
  }

  private async assertActiveCategory(client: PoolClient, code: string): Promise<void> {
    const result = await client.query(`SELECT code FROM categories WHERE code=$1 AND status='active' AND parent_code IS NOT NULL FOR SHARE`, [code]);
    if (!result.rowCount) throw new BadRequestException('categoryCode must identify an active canonical category.');
  }

  private async assertBusinessOwner(client: PoolClient, businessProfileId: string | null | undefined, ownerUserId: string): Promise<void> {
    if (!businessProfileId) return;
    const result = await client.query<{ owner_user_id: string }>(`SELECT owner_user_id FROM business_profiles WHERE id=$1 FOR SHARE`, [businessProfileId]);
    if (!result.rows[0]) throw new NotFoundException('Business profile was not found.');
    if (result.rows[0].owner_user_id !== ownerUserId) throw new ForbiddenException('Access denied.');
  }

  private assertContentContracts(content: AdContentInput): void {
    if (content.priceMode === 'fixed') {
      if (!content.priceMinor || !content.currency) throw new BadRequestException('Fixed-price ad requires priceMinor and currency.');
    } else if (content.priceMinor !== undefined || content.currency !== undefined) {
      throw new BadRequestException('Non-fixed ad cannot carry priceMinor or currency.');
    }
    if (content.contactMode === 'profile') {
      if (content.contactValue) throw new BadRequestException('Profile contact cannot carry contactValue.');
    } else if (!content.contactValue || content.contactValue.length < 6) {
      throw new BadRequestException('Direct contact requires contactValue.');
    }
  }

  private async isFuture(client: PoolClient, value: string): Promise<boolean> {
    const result = await client.query<{ valid: boolean }>(`SELECT $1::timestamptz > clock_timestamp() AS valid`, [value]);
    return result.rows[0]?.valid === true;
  }

  private async assertBusinessPublishable(client: PoolClient, businessProfileId: string | undefined): Promise<void> {
    if (!businessProfileId) return;
    const result = await client.query(`SELECT id FROM business_profiles WHERE id=$1 AND visibility='public' AND moderation_status='approved'
      AND trust_status='approved' AND status='active' FOR SHARE`, [businessProfileId]);
    if (!result.rowCount) throw new BadRequestException('Linked business must be public, approved, trusted, and active.');
  }

  private assertCreateCompatible(ad: AdListing, ownerUserId: string, input: AdContentInput): void {
    const same = ad.ownerUserId === ownerUserId
      && ad.businessProfileId === (input.businessProfileId ?? undefined)
      && ad.kind === input.kind && ad.titleAr === input.titleAr && ad.descriptionAr === input.descriptionAr
      && ad.categoryCode === input.categoryCode && ad.priceMode === input.priceMode && ad.priceMinor === input.priceMinor
      && ad.currency === input.currency && ad.cityCode === input.cityCode && ad.areaText === input.areaText
      && ad.contactMode === input.contactMode && ad.contactValue === input.contactValue && ad.expiresAt === input.expiresAt;
    if (!same) throw new ConflictException({ code: 'REQUEST_KEY_REBOUND' });
  }
}

function map(row: AdRow): AdListing {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    businessProfileId: row.business_profile_id ?? undefined,
    kind: row.kind,
    titleAr: row.title_ar,
    descriptionAr: row.description_ar ?? undefined,
    categoryCode: row.category_code,
    priceMode: row.price_mode,
    priceMinor: row.price_minor === null ? undefined : Number(row.price_minor),
    currency: row.currency ?? undefined,
    cityCode: row.city_code ?? undefined,
    areaText: row.area_text ?? undefined,
    contactMode: row.contact_mode,
    contactValue: row.contact_value ?? undefined,
    status: row.status,
    rejectionReason: row.rejection_reason ?? undefined,
    imageUrls: row.image_urls ?? [],
    expiresAt: row.expires_at?.toISOString(),
    submittedAt: row.submitted_at?.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    revision: Number(row.revision),
    contentRevision: Number(row.content_revision),
    reviewRevision: Number(row.review_revision)
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}
