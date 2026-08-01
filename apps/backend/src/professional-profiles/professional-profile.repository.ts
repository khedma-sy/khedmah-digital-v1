import { Inject, Injectable } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { ProfessionalProfile } from './professional-profile.types';

interface ProfessionalProfileRow extends Record<string, unknown> {
  readonly id: string;
  readonly user_id: string;
  readonly headline_ar: string;
  readonly headline_en: string | null;
  readonly bio_ar: string | null;
  readonly bio_en: string | null;
  readonly availability: string;
  readonly city_code: string;
  readonly country_code: string;
  readonly skills: string[];
  readonly created_at: Date;
  readonly updated_at: Date;
}

@Injectable()
export class ProfessionalProfileRepository {
  private schemaPromise?: Promise<void>;

  constructor(@Inject(DatabasePool) private readonly db: DatabasePool) {}

  async save(profile: ProfessionalProfile): Promise<void> {
    await this.ensureSchema();
    await this.db.query(
      `INSERT INTO professional_profiles (
         id, user_id, headline_ar, headline_en, bio_ar, bio_en,
         availability, city_code, country_code, skills, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET
         headline_ar = EXCLUDED.headline_ar,
         headline_en = EXCLUDED.headline_en,
         bio_ar = EXCLUDED.bio_ar,
         bio_en = EXCLUDED.bio_en,
         availability = EXCLUDED.availability,
         city_code = EXCLUDED.city_code,
         country_code = EXCLUDED.country_code,
         skills = EXCLUDED.skills,
         updated_at = EXCLUDED.updated_at`,
      [
        profile.id,
        profile.userId,
        profile.headlineAr,
        profile.headlineEn ?? null,
        profile.bioAr ?? null,
        profile.bioEn ?? null,
        profile.availability,
        profile.cityCode,
        profile.countryCode,
        [...profile.skills],
        profile.createdAt,
        profile.updatedAt
      ]
    );
  }

  async findById(id: string): Promise<ProfessionalProfile | undefined> {
    await this.ensureSchema();
    const rows = await this.db.query<ProfessionalProfileRow>(
      `SELECT id, user_id, headline_ar, headline_en, bio_ar, bio_en, availability, city_code, country_code, skills, created_at, updated_at
       FROM professional_profiles
       WHERE id = $1
       LIMIT 1`,
      [id]
    );
    return rows[0] ? this.map(rows[0]) : undefined;
  }

  async findByUserId(userId: string): Promise<ProfessionalProfile | undefined> {
    await this.ensureSchema();
    const rows = await this.db.query<ProfessionalProfileRow>(
      `SELECT id, user_id, headline_ar, headline_en, bio_ar, bio_en, availability, city_code, country_code, skills, created_at, updated_at
       FROM professional_profiles
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    );
    return rows[0] ? this.map(rows[0]) : undefined;
  }

  async listPublic(filters: { cityCode?: string; availability?: string; q?: string }, limit = 20, offset = 0): Promise<ProfessionalProfile[]> {
    await this.ensureSchema();
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (filters.cityCode) {
      params.push(filters.cityCode);
      clauses.push(`city_code = $${params.length}`);
    }
    if (filters.availability) {
      params.push(filters.availability);
      clauses.push(`availability = $${params.length}`);
    }
    if (filters.q) {
      params.push(`%${filters.q}%`);
      clauses.push(`(headline_ar ILIKE $${params.length} OR headline_en ILIKE $${params.length})`);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = await this.db.query<ProfessionalProfileRow>(
      `SELECT id, user_id, headline_ar, headline_en, bio_ar, bio_en, availability, city_code, country_code, skills, created_at, updated_at
       FROM professional_profiles
       ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    return rows.map((row) => this.map(row));
  }

  private map(row: ProfessionalProfileRow): ProfessionalProfile {
    return {
      id: row.id,
      userId: row.user_id,
      headlineAr: row.headline_ar,
      headlineEn: row.headline_en ?? undefined,
      bioAr: row.bio_ar ?? undefined,
      bioEn: row.bio_en ?? undefined,
      availability: row.availability as ProfessionalProfile['availability'],
      cityCode: row.city_code,
      countryCode: row.country_code,
      skills: row.skills,
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
      CREATE TABLE IF NOT EXISTS professional_profiles (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE REFERENCES user_accounts(id),
        headline_ar TEXT NOT NULL,
        headline_en TEXT,
        bio_ar TEXT,
        bio_en TEXT,
        availability TEXT NOT NULL DEFAULT 'available' CHECK (availability IN ('available','busy','unavailable')),
        city_code TEXT NOT NULL,
        country_code TEXT NOT NULL,
        skills TEXT[] NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.db.query(`CREATE INDEX IF NOT EXISTS professional_profiles_user_idx ON professional_profiles(user_id)`);
    await this.db.query(`CREATE INDEX IF NOT EXISTS professional_profiles_city_idx ON professional_profiles(city_code, availability)`);
  }
}
