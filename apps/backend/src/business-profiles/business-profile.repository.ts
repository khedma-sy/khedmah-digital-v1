import { Inject, Injectable } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { BusinessProfile, BusinessProfileTrustStatus } from './business-profile.types';

interface BusinessProfileRow extends Record<string, unknown> {
  readonly id: string;
  readonly name: string;
  readonly description_ar: string | null;
  readonly description_en: string | null;
  readonly owner_user_id: string;
  readonly organization_id: string | null;
  readonly visibility: string;
  readonly trust_status: string;
  readonly status: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly website: string | null;
  readonly category_code: string;
  readonly city_code: string;
  readonly country_code: string;
  readonly created_at: Date;
  readonly updated_at: Date;
}

@Injectable()
export class BusinessProfileRepository {
  private schemaPromise?: Promise<void>;

  constructor(@Inject(DatabasePool) private readonly db: DatabasePool) {}

  async save(profile: BusinessProfile): Promise<void> {
    await this.ensureSchema();
    await this.db.query(
      `INSERT INTO business_profiles (
         id, name, description_ar, description_en, owner_user_id, organization_id,
         visibility, trust_status, status, phone, email, website,
         category_code, city_code, country_code, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description_ar = EXCLUDED.description_ar,
         description_en = EXCLUDED.description_en,
         organization_id = EXCLUDED.organization_id,
         visibility = EXCLUDED.visibility,
         trust_status = EXCLUDED.trust_status,
         status = EXCLUDED.status,
         phone = EXCLUDED.phone,
         email = EXCLUDED.email,
         website = EXCLUDED.website,
         category_code = EXCLUDED.category_code,
         city_code = EXCLUDED.city_code,
         country_code = EXCLUDED.country_code,
         updated_at = EXCLUDED.updated_at`,
      [
        profile.id,
        profile.name,
        profile.descriptionAr ?? null,
        profile.descriptionEn ?? null,
        profile.ownerUserId,
        profile.organizationId ?? null,
        profile.visibility,
        profile.trustStatus,
        profile.status,
        profile.phone ?? null,
        profile.email ?? null,
        profile.website ?? null,
        profile.categoryCode,
        profile.cityCode,
        profile.countryCode,
        profile.createdAt,
        profile.updatedAt
      ]
    );
  }

  async findById(id: string): Promise<BusinessProfile | undefined> {
    await this.ensureSchema();
    const rows = await this.db.query<BusinessProfileRow>(
      `SELECT id, name, description_ar, description_en, owner_user_id, organization_id, visibility, trust_status,
              status, phone, email, website, category_code, city_code, country_code, created_at, updated_at
       FROM business_profiles
       WHERE id = $1
       LIMIT 1`,
      [id]
    );
    return rows[0] ? this.map(rows[0]) : undefined;
  }

  async listForUser(userId: string): Promise<BusinessProfile[]> {
    await this.ensureSchema();
    const rows = await this.db.query<BusinessProfileRow>(
      `SELECT id, name, description_ar, description_en, owner_user_id, organization_id, visibility, trust_status,
              status, phone, email, website, category_code, city_code, country_code, created_at, updated_at
       FROM business_profiles
       WHERE owner_user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    return rows.map((row) => this.map(row));
  }

  async listPublicApproved(filters: { categoryCode?: string; cityCode?: string; q?: string }, limit = 20, offset = 0): Promise<BusinessProfile[]> {
    await this.ensureSchema();
    const { where, params } = this.publicApprovedWhere(filters);
    const rows = await this.db.query<BusinessProfileRow>(
      `SELECT id, name, description_ar, description_en, owner_user_id, organization_id, visibility, trust_status,
              status, phone, email, website, category_code, city_code, country_code, created_at, updated_at
       FROM business_profiles
       ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    return rows.map((row) => this.map(row));
  }

  async countPublicApproved(filters: { categoryCode?: string; cityCode?: string; q?: string }): Promise<number> {
    await this.ensureSchema();
    const { where, params } = this.publicApprovedWhere(filters);
    const rows = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM business_profiles ${where}`,
      params
    );
    return Number.parseInt(rows[0]?.count ?? '0', 10);
  }

  async updateTrustStatus(id: string, trustStatus: BusinessProfileTrustStatus, updatedAt: string): Promise<void> {
    await this.ensureSchema();
    await this.db.query(
      `UPDATE business_profiles
       SET trust_status = $2, updated_at = $3
       WHERE id = $1`,
      [id, trustStatus, updatedAt]
    );
  }

  private publicApprovedWhere(filters: { categoryCode?: string; cityCode?: string; q?: string }) {
    const clauses = ["visibility = 'public'", "trust_status = 'approved'", "status = 'active'"];
    const params: unknown[] = [];

    if (filters.categoryCode) {
      params.push(filters.categoryCode);
      clauses.push(`category_code = $${params.length}`);
    }
    if (filters.cityCode) {
      params.push(filters.cityCode);
      clauses.push(`city_code = $${params.length}`);
    }
    if (filters.q) {
      params.push(`%${filters.q}%`);
      clauses.push(`name ILIKE $${params.length}`);
    }

    return {
      where: `WHERE ${clauses.join(' AND ')}`,
      params
    };
  }

  private map(row: BusinessProfileRow): BusinessProfile {
    return {
      id: row.id,
      name: row.name,
      descriptionAr: row.description_ar ?? undefined,
      descriptionEn: row.description_en ?? undefined,
      ownerUserId: row.owner_user_id,
      organizationId: row.organization_id ?? undefined,
      visibility: row.visibility as BusinessProfile['visibility'],
      trustStatus: row.trust_status as BusinessProfile['trustStatus'],
      status: row.status as BusinessProfile['status'],
      phone: row.phone ?? undefined,
      email: row.email ?? undefined,
      website: row.website ?? undefined,
      categoryCode: row.category_code,
      cityCode: row.city_code,
      countryCode: row.country_code,
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
      CREATE TABLE IF NOT EXISTS business_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description_ar TEXT,
        description_en TEXT,
        owner_user_id TEXT NOT NULL REFERENCES user_accounts(id),
        organization_id TEXT REFERENCES organizations(id),
        visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('public','private')),
        trust_status TEXT NOT NULL DEFAULT 'pending' CHECK (trust_status IN ('pending','approved','suspended')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
        phone TEXT,
        email TEXT,
        website TEXT,
        category_code TEXT NOT NULL,
        city_code TEXT NOT NULL,
        country_code TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.db.query(`CREATE INDEX IF NOT EXISTS business_profiles_owner_idx ON business_profiles(owner_user_id)`);
    await this.db.query(`CREATE INDEX IF NOT EXISTS business_profiles_visibility_trust_idx ON business_profiles(visibility, trust_status)`);
    await this.db.query(`CREATE INDEX IF NOT EXISTS business_profiles_category_idx ON business_profiles(category_code)`);
    await this.db.query(`CREATE INDEX IF NOT EXISTS business_profiles_city_idx ON business_profiles(city_code)`);
  }
}
