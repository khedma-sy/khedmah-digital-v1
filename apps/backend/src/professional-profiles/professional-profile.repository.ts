import { Inject, Injectable } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { MediaAsset, ProfessionalProfile, TrustHistoryEntry, VerificationRequest } from './professional-profile.types';

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
  readonly is_featured: boolean;
  readonly featured_at: Date | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

@Injectable()
export class ProfessionalProfileRepository {
  constructor(@Inject(DatabasePool) private readonly db: DatabasePool) {}

  async save(profile: ProfessionalProfile): Promise<void> {
    await this.db.query(
      `INSERT INTO professional_profiles (
         professional_profile_identifier, profile_identifier, user_identifier, profession_type,
         lifecycle_status, visibility, moderation_status, headline_ar, headline_en, bio_ar, bio_en,
         availability, city_code, country_code, skills, created_at, updated_at
       )
       SELECT $1, p.profile_identifier, $2, 'freelancer', 'active', 'private', 'pending',
              $3,$4,$5,$6,$7,$8,$9,$10,$11,$12
       FROM profiles p WHERE p.user_identifier = $2
       ON CONFLICT (professional_profile_identifier) DO UPDATE SET
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
    const rows = await this.db.query<ProfessionalProfileRow>(
      `SELECT professional_profile_identifier AS id, user_identifier AS user_id, headline_ar, headline_en, bio_ar, bio_en, availability, city_code, country_code, skills, is_featured, featured_at, created_at, updated_at
       FROM professional_profiles
       WHERE professional_profile_identifier = $1
       LIMIT 1`,
      [id]
    );
    return rows[0] ? this.map(rows[0]) : undefined;
  }

  async findContactEligibility(id: string): Promise<{ visibility: 'public' | 'private' | 'internal'; moderationStatus: 'approved' | 'pending' | 'rejected' | 'suspended'; lifecycleStatus: 'created' | 'pending' | 'active' | 'suspended' | 'archived' } | undefined> {
    const rows = await this.db.query<{ visibility: 'public' | 'private' | 'internal'; moderation_status: 'approved' | 'pending' | 'rejected' | 'suspended'; lifecycle_status: 'created' | 'pending' | 'active' | 'suspended' | 'archived' }>(
      `SELECT visibility, moderation_status, lifecycle_status FROM professional_profiles
       WHERE professional_profile_identifier = $1 LIMIT 1`, [id]);
    return rows[0] ? { visibility: rows[0].visibility, moderationStatus: rows[0].moderation_status, lifecycleStatus: rows[0].lifecycle_status } : undefined;
  }

  async findByUserId(userId: string): Promise<ProfessionalProfile | undefined> {
    const rows = await this.db.query<ProfessionalProfileRow>(
      `SELECT professional_profile_identifier AS id, user_identifier AS user_id, headline_ar, headline_en, bio_ar, bio_en, availability, city_code, country_code, skills, is_featured, featured_at, created_at, updated_at
       FROM professional_profiles
       WHERE user_identifier = $1
       LIMIT 1`,
      [userId]
    );
    return rows[0] ? this.map(rows[0]) : undefined;
  }

  async listPublic(filters: { cityCode?: string; availability?: string; q?: string }, limit = 20, offset = 0): Promise<ProfessionalProfile[]> {
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
      `SELECT professional_profile_identifier AS id, user_identifier AS user_id, headline_ar, headline_en, bio_ar, bio_en, availability, city_code, country_code, skills, is_featured, featured_at, created_at, updated_at
       FROM professional_profiles
       ${where ? `${where} AND` : 'WHERE'} visibility = 'public' AND moderation_status = 'approved' AND lifecycle_status = 'active'
       ORDER BY is_featured DESC, created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    return rows.map((row) => this.map(row));
  }

  async listFeatured(limit = 6): Promise<ProfessionalProfile[]> {
    const rows = await this.db.query<ProfessionalProfileRow>(
      `SELECT professional_profile_identifier AS id, user_identifier AS user_id, headline_ar, headline_en, bio_ar, bio_en, availability, city_code, country_code, skills, is_featured, featured_at, created_at, updated_at
       FROM professional_profiles
       WHERE is_featured = TRUE AND visibility = 'public' AND moderation_status = 'approved' AND lifecycle_status = 'active'
       ORDER BY featured_at DESC
       LIMIT $1`,
      [limit]
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
      isFeatured: row.is_featured ?? false,
      featuredAt: row.featured_at?.toISOString(),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    };
  }

  async saveMediaAsset(asset: MediaAsset): Promise<void> {
    await this.db.query(
      `INSERT INTO media_assets
         (id, owner_user_id, owner_type, owner_id, filename, mime_type, size_bytes, visibility,
          storage_key, public_url, asset_type, sort_order, created_at, updated_at)
       SELECT $1, p.user_identifier, 'professional_profile', $3, $1, $7, $8, 'public', $6, $5, $4, $9, $10, $10
       FROM professional_profiles p WHERE p.professional_profile_identifier = $3
       ON CONFLICT (id) DO UPDATE SET public_url = EXCLUDED.public_url, sort_order = EXCLUDED.sort_order`,
      [asset.id, asset.entityType, asset.entityId, asset.assetType, asset.url, asset.storagePath, asset.mimeType, asset.sizeBytes, asset.sortOrder, asset.createdAt]
    );
  }

  async listMediaAssets(entityId: string, assetType?: string): Promise<MediaAsset[]> {
    const params: unknown[] = ['professional_profile', entityId];
    let assetTypeClause = '';
    if (assetType) {
      params.push(assetType);
      assetTypeClause = `AND asset_type = $${params.length}`;
    }
    const rows = await this.db.query<{ id: string; entity_type: string; entity_id: string; asset_type: string; url: string; storage_path: string; mime_type: string; size_bytes: number; sort_order: number; created_at: Date }>(
      `SELECT id, owner_type AS entity_type, owner_id AS entity_id, asset_type,
              public_url AS url, storage_key AS storage_path, mime_type, size_bytes, sort_order, created_at
       FROM media_assets
       WHERE owner_type = $1 AND owner_id = $2 ${assetTypeClause}
       ORDER BY sort_order ASC, created_at ASC`,
      params
    );
    return rows.map((r) => ({
      id: r.id,
      entityType: r.entity_type,
      entityId: r.entity_id,
      assetType: r.asset_type as MediaAsset['assetType'],
      url: r.url,
      storagePath: r.storage_path,
      mimeType: r.mime_type,
      sizeBytes: r.size_bytes,
      sortOrder: r.sort_order,
      createdAt: r.created_at.toISOString()
    }));
  }

  async saveVerificationRequest(req: VerificationRequest): Promise<void> {
    await this.db.query(
      `INSERT INTO verification_requests (id, entity_type, entity_id, requester_id, status, notes, reviewed_by, reviewed_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes, updated_at = EXCLUDED.updated_at`,
      [req.id, req.entityType, req.entityId, req.requesterId, req.status, req.notes ?? null, null, null, req.createdAt, req.updatedAt]
    );
  }

  async findVerificationRequest(entityId: string): Promise<VerificationRequest | undefined> {
    const rows = await this.db.query<{ id: string; entity_type: string; entity_id: string; requester_id: string; status: string; notes: string | null; created_at: Date; updated_at: Date }>(
      `SELECT id, entity_type, entity_id, requester_id, status, notes, created_at, updated_at
       FROM verification_requests WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at DESC LIMIT 1`,
      ['professional', entityId]
    );
    if (!rows[0]) return undefined;
    const r = rows[0];
    return { id: r.id, entityType: r.entity_type as 'professional', entityId: r.entity_id, requesterId: r.requester_id, status: r.status as VerificationRequest['status'], notes: r.notes ?? undefined, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString() };
  }

  async listTrustHistory(entityId: string): Promise<TrustHistoryEntry[]> {
    const rows = await this.db.query<{ id: string; entity_type: string; entity_id: string; old_status: string | null; new_status: string; changed_by: string | null; reason: string | null; created_at: Date }>(
      `SELECT id, entity_type, entity_id, old_status, new_status, changed_by, reason, created_at
       FROM trust_history WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at DESC`,
      ['professional', entityId]
    );
    return rows.map((r) => ({ id: r.id, entityType: r.entity_type, entityId: r.entity_id, oldStatus: r.old_status ?? undefined, newStatus: r.new_status, changedBy: r.changed_by ?? undefined, reason: r.reason ?? undefined, createdAt: r.created_at.toISOString() }));
  }
}
