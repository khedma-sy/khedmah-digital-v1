import { Inject, Injectable } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { ServiceListing, ServiceOwnerType } from './service-catalog.types';

interface ServiceListingRow extends Record<string, unknown> {
  readonly id: string;
  readonly owner_type: string;
  readonly owner_id: string;
  readonly title_ar: string;
  readonly title_en: string | null;
  readonly description_ar: string | null;
  readonly description_en: string | null;
  readonly category_code: string;
  readonly price: string | number | null;
  readonly price_currency: string | null;
  readonly price_type: string;
  readonly status: string;
  readonly is_featured: boolean;
  readonly featured_at: Date | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

@Injectable()
export class ServiceCatalogRepository {
  constructor(@Inject(DatabasePool) private readonly db: DatabasePool) {}

  async save(service: ServiceListing): Promise<void> {
    await this.db.query(
      `INSERT INTO service_listings (
         id, owner_type, owner_id, title_ar, title_en, description_ar, description_en,
         category_code, price, price_currency, price_type, status, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (id) DO UPDATE SET
         title_ar = EXCLUDED.title_ar,
         title_en = EXCLUDED.title_en,
         description_ar = EXCLUDED.description_ar,
         description_en = EXCLUDED.description_en,
         category_code = EXCLUDED.category_code,
         price = EXCLUDED.price,
         price_currency = EXCLUDED.price_currency,
         price_type = EXCLUDED.price_type,
         status = EXCLUDED.status,
         updated_at = EXCLUDED.updated_at`,
      [
        service.id,
        service.ownerType,
        service.ownerId,
        service.titleAr,
        service.titleEn ?? null,
        service.descriptionAr ?? null,
        service.descriptionEn ?? null,
        service.categoryCode,
        service.price ?? null,
        service.priceCurrency ?? null,
        service.priceType,
        service.status,
        service.createdAt,
        service.updatedAt
      ]
    );
  }

  async findById(id: string): Promise<ServiceListing | undefined> {
    const rows = await this.db.query<ServiceListingRow>(
      `SELECT id, owner_type, owner_id, title_ar, title_en, description_ar, description_en,
              category_code, price, price_currency, price_type, status, created_at, updated_at
       FROM service_listings
       WHERE id = $1
       LIMIT 1`,
      [id]
    );
    return rows[0] ? this.map(rows[0]) : undefined;
  }

  async listForOwner(ownerId: string, ownerType: ServiceOwnerType): Promise<ServiceListing[]> {
    const rows = await this.db.query<ServiceListingRow>(
      `SELECT id, owner_type, owner_id, title_ar, title_en, description_ar, description_en,
              category_code, price, price_currency, price_type, status, created_at, updated_at
       FROM service_listings
       WHERE owner_id = $1 AND owner_type = $2
       ORDER BY created_at DESC`,
      [ownerId, ownerType]
    );
    return rows.map((row) => this.map(row));
  }

  async listActive(filters: { categoryCode?: string; q?: string }, limit = 20, offset = 0): Promise<ServiceListing[]> {
    const clauses = ["status = 'active'"];
    const params: unknown[] = [];
    if (filters.categoryCode) {
      params.push(filters.categoryCode);
      clauses.push(`category_code = $${params.length}`);
    }
    if (filters.q) {
      params.push(`%${filters.q}%`);
      clauses.push(`(title_ar ILIKE $${params.length} OR title_en ILIKE $${params.length})`);
    }
    const rows = await this.db.query<ServiceListingRow>(
      `SELECT id, owner_type, owner_id, title_ar, title_en, description_ar, description_en,
              category_code, price, price_currency, price_type, status, created_at, updated_at
       FROM service_listings
       WHERE ${clauses.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    return rows.map((row) => this.map(row));
  }

  async countActive(filters: { categoryCode?: string; q?: string }): Promise<number> {
    const clauses = ["status = 'active'"];
    const params: unknown[] = [];
    if (filters.categoryCode) {
      params.push(filters.categoryCode);
      clauses.push(`category_code = $${params.length}`);
    }
    if (filters.q) {
      params.push(`%${filters.q}%`);
      clauses.push(`(title_ar ILIKE $${params.length} OR title_en ILIKE $${params.length})`);
    }
    const rows = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM service_listings WHERE ${clauses.join(' AND ')}`,
      params
    );
    return Number.parseInt(rows[0]?.count ?? '0', 10);
  }

  async findAndVerifyOwnership(id: string, ownerId: string): Promise<ServiceListing | undefined> {
    const rows = await this.db.query<ServiceListingRow>(
      `SELECT id, owner_type, owner_id, title_ar, title_en, description_ar, description_en,
              category_code, price, price_currency, price_type, status, created_at, updated_at
       FROM service_listings
       WHERE id = $1 AND owner_id = $2
       LIMIT 1`,
      [id, ownerId]
    );
    return rows[0] ? this.map(rows[0]) : undefined;
  }

  async listPublicEligible(filters: { categoryCode?: string; q?: string }, limit = 20, offset = 0): Promise<ServiceListing[]> {
    const { whereClauses, params } = this.publicEligibleWhere(filters);
    const rows = await this.db.query<ServiceListingRow>(
      `SELECT sl.id, sl.owner_type, sl.owner_id, sl.title_ar, sl.title_en, sl.description_ar, sl.description_en,
              sl.category_code, sl.price, sl.price_currency, sl.price_type, sl.status, sl.created_at, sl.updated_at
       FROM service_listings sl
       WHERE ${whereClauses.join(' AND ')}
       ORDER BY sl.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    return rows.map((row) => this.map(row));
  }

  async countPublicEligible(filters: { categoryCode?: string; q?: string }): Promise<number> {
    const { whereClauses, params } = this.publicEligibleWhere(filters);
    const rows = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM service_listings sl WHERE ${whereClauses.join(' AND ')}`,
      params
    );
    return Number.parseInt(rows[0]?.count ?? '0', 10);
  }

  async listFeatured(limit = 6): Promise<ServiceListing[]> {
    const rows = await this.db.query<ServiceListingRow>(
      `SELECT sl.id, sl.owner_type, sl.owner_id, sl.title_ar, sl.title_en, sl.description_ar, sl.description_en,
              sl.category_code, sl.price, sl.price_currency, sl.price_type, sl.status, sl.is_featured, sl.featured_at, sl.created_at, sl.updated_at
       FROM service_listings sl
       WHERE sl.status = 'active' AND sl.is_featured = TRUE
       ORDER BY sl.featured_at DESC
       LIMIT $1`,
      [limit]
    );
    return rows.map((row) => this.map(row));
  }

  private publicEligibleWhere(filters: { categoryCode?: string; q?: string }) {
    const whereClauses: string[] = [
      "sl.status = 'active'",
      `(
        (sl.owner_type = 'business' AND EXISTS (
          SELECT 1 FROM business_profiles bp
          WHERE bp.id = sl.owner_id
            AND bp.visibility = 'public'
            AND bp.trust_status = 'approved'
            AND bp.status = 'active'
        ))
        OR
        (sl.owner_type = 'professional' AND EXISTS (
          SELECT 1 FROM professional_profiles pp
          WHERE pp.professional_profile_identifier = sl.owner_id
            AND pp.visibility = 'public' AND pp.moderation_status = 'approved' AND pp.lifecycle_status = 'active'
        ))
      )`
    ];
    const params: unknown[] = [];
    if (filters.categoryCode) {
      params.push(filters.categoryCode);
      whereClauses.push(`sl.category_code IN (
        WITH RECURSIVE category_tree AS (
          SELECT code FROM categories WHERE code = $${params.length} AND status = 'active'
          UNION ALL
          SELECT child.code FROM categories child JOIN category_tree parent ON child.parent_code = parent.code
          WHERE child.status = 'active'
        ) SELECT code FROM category_tree
      )`);
    }
    if (filters.q) {
      params.push(`%${filters.q}%`);
      whereClauses.push(`(
        sl.title_ar ILIKE $${params.length}
        OR COALESCE(sl.title_en, '') ILIKE $${params.length}
        OR COALESCE(sl.description_ar, '') ILIKE $${params.length}
        OR COALESCE(sl.description_en, '') ILIKE $${params.length}
        OR EXISTS (
          WITH RECURSIVE category_lineage AS (
            SELECT code, parent_code, name_ar, name_en, search_aliases_ar, search_aliases_en
            FROM categories WHERE code = sl.category_code AND status = 'active'
            UNION
            SELECT parent.code, parent.parent_code, parent.name_ar, parent.name_en,
              parent.search_aliases_ar, parent.search_aliases_en
            FROM categories parent
            JOIN category_lineage child ON parent.code = child.parent_code
            WHERE parent.status = 'active'
          )
          SELECT 1 FROM category_lineage c
          WHERE c.name_ar ILIKE $${params.length}
            OR COALESCE(c.name_en, '') ILIKE $${params.length}
            OR array_to_string(c.search_aliases_ar, ' ') ILIKE $${params.length}
            OR array_to_string(c.search_aliases_en, ' ') ILIKE $${params.length}
        )
      )`);
    }
    return { whereClauses, params };
  }

  private map(row: ServiceListingRow): ServiceListing {
    return {
      id: row.id,
      ownerType: row.owner_type as ServiceListing['ownerType'],
      ownerId: row.owner_id,
      titleAr: row.title_ar,
      titleEn: row.title_en ?? undefined,
      descriptionAr: row.description_ar ?? undefined,
      descriptionEn: row.description_en ?? undefined,
      categoryCode: row.category_code,
      price: row.price === null ? undefined : Number(row.price),
      priceCurrency: row.price_currency === null ? undefined : row.price_currency as ServiceListing['priceCurrency'],
      priceType: row.price_type as ServiceListing['priceType'],
      status: row.status as ServiceListing['status'],
      isFeatured: row.is_featured ?? false,
      featuredAt: row.featured_at?.toISOString(),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    };
  }

}
