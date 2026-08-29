import { Inject, Injectable } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import type { ProductListing } from './product.types';

interface ProductRow extends Record<string, unknown> {
  id: string; business_profile_id: string; owner_user_id: string; title_ar: string; description_ar: string | null;
  price: string; currency: 'SYP' | 'USD'; category_code: string; availability: ProductListing['availability'];
  status: ProductListing['status']; moderation_status: ProductListing['moderationStatus']; rejection_reason: string | null;
  image_url: string | null; image_urls: string[] | null; business_name: string | null; city_code: string | null; created_at: Date; updated_at: Date;
}

const projection = `p.id, p.business_profile_id, p.owner_user_id, p.title_ar, p.description_ar, p.price, p.currency,
  p.category_code, p.availability, p.status, p.moderation_status, p.rejection_reason, p.created_at, p.updated_at,
  b.name AS business_name, b.city_code,
  (SELECT public_url FROM media_assets WHERE owner_type = 'product_listing' AND owner_id = p.id AND asset_type = 'product_image' AND visibility = 'public' ORDER BY sort_order, created_at LIMIT 1) AS image_url,
  (SELECT COALESCE(array_agg(public_url ORDER BY sort_order, created_at), ARRAY[]::text[]) FROM media_assets WHERE owner_type = 'product_listing' AND owner_id = p.id AND asset_type = 'product_image' AND visibility = 'public') AS image_urls`;

@Injectable()
export class ProductRepository {
  constructor(@Inject(DatabasePool) private readonly db: DatabasePool) {}

  async insert(product: ProductListing): Promise<void> {
    await this.db.query(
      `INSERT INTO product_listings
        (id,business_profile_id,owner_user_id,title_ar,description_ar,price,currency,category_code,availability,status,moderation_status,rejection_reason,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [product.id, product.businessProfileId, product.ownerUserId, product.titleAr, product.descriptionAr ?? null, product.price, product.currency, product.categoryCode, product.availability, product.status, product.moderationStatus, product.rejectionReason ?? null, product.createdAt, product.updatedAt]
    );
  }

  async update(product: ProductListing): Promise<void> {
    await this.db.query(
      `UPDATE product_listings SET title_ar=$2,description_ar=$3,price=$4,currency=$5,category_code=$6,
       availability=$7,status=$8,moderation_status=$9,rejection_reason=$10,updated_at=$11 WHERE id=$1`,
      [product.id, product.titleAr, product.descriptionAr ?? null, product.price, product.currency, product.categoryCode, product.availability, product.status, product.moderationStatus, product.rejectionReason ?? null, product.updatedAt]
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

  async listPublic(filters: { q?: string; categoryCode?: string; cityCode?: string }): Promise<ProductListing[]> {
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
    return (await this.db.query<ProductRow>(`SELECT ${projection} FROM product_listings p JOIN business_profiles b ON b.id=p.business_profile_id WHERE ${clauses.join(' AND ')} ORDER BY p.created_at DESC LIMIT 100`, params)).map(map);
  }

  async listPending(): Promise<ProductListing[]> {
    return (await this.db.query<ProductRow>(`SELECT ${projection} FROM product_listings p JOIN business_profiles b ON b.id=p.business_profile_id WHERE p.moderation_status='pending' AND p.status='active' ORDER BY p.updated_at ASC`)).map(map);
  }

  async hasPublicImage(id: string): Promise<boolean> {
    const [row] = await this.db.query<{ exists: boolean }>(`SELECT EXISTS(SELECT 1 FROM media_assets WHERE owner_type='product_listing' AND owner_id=$1 AND asset_type='product_image' AND visibility='public') AS exists`, [id]);
    return row?.exists ?? false;
  }
}

function map(row: ProductRow): ProductListing {
  return { id: row.id, businessProfileId: row.business_profile_id, ownerUserId: row.owner_user_id, titleAr: row.title_ar,
    descriptionAr: row.description_ar ?? undefined, price: Number(row.price), currency: row.currency, categoryCode: row.category_code,
    availability: row.availability, status: row.status, moderationStatus: row.moderation_status, rejectionReason: row.rejection_reason ?? undefined,
    imageUrl: row.image_url ?? undefined, imageUrls: row.image_urls ?? [], businessName: row.business_name ?? undefined, cityCode: row.city_code ?? undefined,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() };
}
