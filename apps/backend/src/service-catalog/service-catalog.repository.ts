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
  readonly created_at: Date;
  readonly updated_at: Date;
}

@Injectable()
export class ServiceCatalogRepository {
  private schemaPromise?: Promise<void>;

  constructor(@Inject(DatabasePool) private readonly db: DatabasePool) {}

  async save(service: ServiceListing): Promise<void> {
    await this.ensureSchema();
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
    await this.ensureSchema();
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
    await this.ensureSchema();
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
    await this.ensureSchema();
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
    await this.ensureSchema();
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
    await this.ensureSchema();
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
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    };
  }

  private async ensureSchema(): Promise<void> {
    if (!this.schemaPromise) {
      this.schemaPromise = this.initializeSchema();
    }
    await this.schemaPromise;
  }

  private async initializeSchema(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS service_listings (
        id TEXT PRIMARY KEY,
        owner_type TEXT NOT NULL CHECK (owner_type IN ('business','professional')),
        owner_id TEXT NOT NULL,
        title_ar TEXT NOT NULL,
        title_en TEXT,
        description_ar TEXT,
        description_en TEXT,
        category_code TEXT NOT NULL,
        price NUMERIC,
        price_currency TEXT DEFAULT 'SYP',
        price_type TEXT NOT NULL DEFAULT 'negotiable' CHECK (price_type IN ('fixed','hourly','negotiable')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.db.query(`CREATE INDEX IF NOT EXISTS service_listings_owner_idx ON service_listings(owner_id, owner_type)`);
    await this.db.query(`CREATE INDEX IF NOT EXISTS service_listings_category_idx ON service_listings(category_code, status)`);
  }
}
