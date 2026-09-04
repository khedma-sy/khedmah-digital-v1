import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabasePool } from '../database/database.pool';
import type { ProductListing, PublicProductFilters } from './product.types';

interface ProductRow extends Record<string, unknown> {
  id: string; business_profile_id: string; owner_user_id: string; title_ar: string; description_ar: string | null;
  price: string; currency: 'SYP' | 'USD'; category_code: string; availability: ProductListing['availability'];
  status: ProductListing['status']; moderation_status: ProductListing['moderationStatus']; rejection_reason: string | null;
  requires_prescription: boolean; controlled_item: boolean;
  image_url: string | null; image_urls: string[] | null; business_name: string | null; city_code: string | null; created_at: Date; updated_at: Date;
}

const projection = `p.id, p.business_profile_id, p.owner_user_id, p.title_ar, p.description_ar, p.price, p.currency,
  p.category_code, p.availability, p.status, p.moderation_status, p.rejection_reason, p.requires_prescription, p.controlled_item, p.created_at, p.updated_at,
  b.name AS business_name, b.city_code,
  (SELECT public_url FROM media_assets WHERE owner_type = 'product_listing' AND owner_id = p.id AND asset_type = 'product_image' AND visibility = 'public' ORDER BY sort_order, created_at LIMIT 1) AS image_url,
  (SELECT COALESCE(array_agg(public_url ORDER BY sort_order, created_at), ARRAY[]::text[]) FROM media_assets WHERE owner_type = 'product_listing' AND owner_id = p.id AND asset_type = 'product_image' AND visibility = 'public') AS image_urls`;

@Injectable()
export class ProductRepository {
  constructor(@Inject(DatabasePool) private readonly db: DatabasePool) {}

  async insert(product: ProductListing): Promise<void> {
    await this.db.query(
      `INSERT INTO product_listings
        (id,business_profile_id,owner_user_id,title_ar,description_ar,price,currency,category_code,availability,status,moderation_status,rejection_reason,requires_prescription,controlled_item,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [product.id, product.businessProfileId, product.ownerUserId, product.titleAr, product.descriptionAr ?? null, product.price, product.currency, product.categoryCode, product.availability, product.status, product.moderationStatus, product.rejectionReason ?? null, product.requiresPrescription, product.controlledItem, product.createdAt, product.updatedAt]
    );
  }

  async insertWithinOwnerLimit(product: ProductListing, limit: number): Promise<boolean> {
    return this.db.transaction(async (client) => {
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [product.ownerUserId]);
      const countResult = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM product_listings WHERE owner_user_id=$1 AND status <> 'inactive'`,
        [product.ownerUserId]
      );
      if (Number(countResult.rows[0]?.count ?? 0) >= limit) return false;
      await client.query(
        `INSERT INTO product_listings
          (id,business_profile_id,owner_user_id,title_ar,description_ar,price,currency,category_code,availability,status,moderation_status,rejection_reason,requires_prescription,controlled_item,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [product.id, product.businessProfileId, product.ownerUserId, product.titleAr, product.descriptionAr ?? null, product.price, product.currency, product.categoryCode, product.availability, product.status, product.moderationStatus, product.rejectionReason ?? null, product.requiresPrescription, product.controlledItem, product.createdAt, product.updatedAt]
      );
      return true;
    });
  }

  async update(product: ProductListing): Promise<void> {
    await this.db.query(
      `UPDATE product_listings SET title_ar=$2,description_ar=$3,price=$4,currency=$5,category_code=$6,
       availability=$7,status=$8,moderation_status=$9,rejection_reason=$10,requires_prescription=$11,controlled_item=$12,updated_at=$13 WHERE id=$1`,
      [product.id, product.titleAr, product.descriptionAr ?? null, product.price, product.currency, product.categoryCode, product.availability, product.status, product.moderationStatus, product.rejectionReason ?? null, product.requiresPrescription, product.controlledItem, product.updatedAt]
    );
  }

  async findById(id: string): Promise<ProductListing | undefined> {
    const [row] = await this.db.query<ProductRow>(`SELECT ${projection} FROM product_listings p JOIN business_profiles b ON b.id=p.business_profile_id WHERE p.id=$1`, [id]);
    return row ? map(row) : undefined;
  }

  async findPublicById(id: string): Promise<ProductListing | undefined> {
    const [row] = await this.db.query<ProductRow>(
      `SELECT ${projection}
       FROM product_listings p
       JOIN business_profiles b ON b.id=p.business_profile_id
       WHERE p.id=$1
         AND p.status='active'
         AND p.moderation_status='approved'
         AND b.visibility='public'
         AND b.moderation_status='approved'
         AND b.trust_status='approved'
         AND b.status='active'`,
      [id]
    );
    return row ? map(row) : undefined;
  }

  async listMine(ownerUserId: string): Promise<ProductListing[]> {
    const rows = await this.db.query<ProductRow>(`SELECT ${projection} FROM product_listings p JOIN business_profiles b ON b.id=p.business_profile_id WHERE p.owner_user_id=$1 ORDER BY p.created_at DESC`, [ownerUserId]);
    return rows.map(map);
  }

  async listPublic(filters: PublicProductFilters): Promise<ProductListing[]> {
    const clauses = ["p.status='active'", "p.moderation_status='approved'", "b.visibility='public'", "b.moderation_status='approved'", "b.trust_status='approved'", "b.status='active'"];
    const params: unknown[] = [];
    if (filters.q) {
      params.push(`%${filters.q}%`);
      clauses.push(`(p.title_ar ILIKE $${params.length} OR COALESCE(p.description_ar,'') ILIKE $${params.length} OR EXISTS (SELECT 1 FROM categories c WHERE c.code=p.category_code AND (c.name_ar ILIKE $${params.length} OR array_to_string(c.search_aliases_ar,' ') ILIKE $${params.length})))`);
    }
    if (filters.categoryCode) {
      params.push(filters.categoryCode);
      clauses.push(`p.category_code IN (WITH RECURSIVE category_tree AS (SELECT code FROM categories WHERE code=$${params.length} AND status='active' UNION ALL SELECT child.code FROM categories child JOIN category_tree parent ON child.parent_code=parent.code WHERE child.status='active') SELECT code FROM category_tree)`);
    }
    if (filters.cityCode) { params.push(filters.cityCode); clauses.push(`b.city_code=$${params.length}`); }
    if (filters.businessProfileId) { params.push(filters.businessProfileId); clauses.push(`p.business_profile_id=$${params.length}`); }
    if (filters.availability) { params.push(filters.availability); clauses.push(`p.availability=$${params.length}`); }
    if (filters.currency) { params.push(filters.currency); clauses.push(`p.currency=$${params.length}`); }
    if (filters.minPrice !== undefined) { params.push(filters.minPrice); clauses.push(`p.price >= $${params.length}`); }
    if (filters.maxPrice !== undefined) { params.push(filters.maxPrice); clauses.push(`p.price <= $${params.length}`); }
    const orderBy = filters.sort === 'price_asc'
      ? 'p.price ASC, p.created_at DESC'
      : filters.sort === 'price_desc'
        ? 'p.price DESC, p.created_at DESC'
        : 'p.created_at DESC';
    return (await this.db.query<ProductRow>(`SELECT ${projection} FROM product_listings p JOIN business_profiles b ON b.id=p.business_profile_id WHERE ${clauses.join(' AND ')} ORDER BY ${orderBy} LIMIT 100`, params)).map(map);
  }

  async listPending(): Promise<ProductListing[]> {
    return (await this.db.query<ProductRow>(`SELECT ${projection} FROM product_listings p JOIN business_profiles b ON b.id=p.business_profile_id WHERE p.moderation_status='pending' AND p.status='active' ORDER BY p.updated_at ASC`)).map(map);
  }

  async hasPublicImage(id: string): Promise<boolean> {
    const [row] = await this.db.query<{ exists: boolean }>(`SELECT EXISTS(SELECT 1 FROM media_assets WHERE owner_type='product_listing' AND owner_id=$1 AND asset_type='product_image' AND visibility='public') AS exists`, [id]);
    return row?.exists ?? false;
  }

  async updateWithAutoModerationAudit(product: ProductListing, approved: boolean, limit: number): Promise<boolean> {
    return this.db.transaction(async (client) => {
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [product.ownerUserId]);
      const countResult = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM product_listings WHERE owner_user_id=$1 AND status <> 'inactive' AND id <> $2`,
        [product.ownerUserId, product.id]
      );
      if (Number(countResult.rows[0]?.count ?? 0) >= limit) return false;
      await client.query(
        `UPDATE product_listings SET title_ar=$2,description_ar=$3,price=$4,currency=$5,category_code=$6,
         availability=$7,status=$8,moderation_status=$9,rejection_reason=$10,requires_prescription=$11,controlled_item=$12,updated_at=$13 WHERE id=$1`,
        [product.id, product.titleAr, product.descriptionAr ?? null, product.price, product.currency, product.categoryCode, product.availability, product.status, product.moderationStatus, product.rejectionReason ?? null, product.requiresPrescription, product.controlledItem, product.updatedAt]
      );
      await client.query(
        `INSERT INTO audit_logs (id, event_type, actor_user_id, correlation_id, occurred_at) VALUES ($1,$2,$3,$4,NOW())`,
        [randomUUID(), approved ? 'product.auto_approved' : 'product.auto_review_required', product.ownerUserId, product.id]
      );
      return true;
    });
  }
}

function map(row: ProductRow): ProductListing {
  return { id: row.id, businessProfileId: row.business_profile_id, ownerUserId: row.owner_user_id, titleAr: row.title_ar,
    descriptionAr: row.description_ar ?? undefined, price: Number(row.price), currency: row.currency, categoryCode: row.category_code,
    availability: row.availability, requiresPrescription: row.requires_prescription, controlledItem: row.controlled_item, status: row.status, moderationStatus: row.moderation_status, rejectionReason: row.rejection_reason ?? undefined,
    imageUrl: row.image_url ?? undefined, imageUrls: row.image_urls ?? [], businessName: row.business_name ?? undefined, cityCode: row.city_code ?? undefined,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() };
}
