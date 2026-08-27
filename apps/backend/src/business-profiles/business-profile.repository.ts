import { Inject, Injectable } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { BusinessBranch, BusinessProfile, BusinessProfileTrustStatus, BusinessSocialLink, MediaAsset, OpeningHours, TrustHistoryEntry, VerificationRequest } from './business-profile.types';

interface BusinessProfileRow extends Record<string, unknown> {
  readonly id: string;
  readonly name: string;
  readonly description_ar: string | null;
  readonly description_en: string | null;
  readonly owner_user_id: string;
  readonly organization_id: string | null;
  readonly visibility: string;
  readonly moderation_status: string;
  readonly trust_status: string;
  readonly status: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly website: string | null;
  readonly category_code: string;
  readonly city_code: string;
  readonly country_code: string;
  readonly lat: string | null;
  readonly lng: string | null;
  readonly address_ar: string | null;
  readonly is_featured: boolean;
  readonly featured_at: Date | null;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly service_radius?: string;
  readonly availability?: string;
  readonly rating?: string;
  readonly response_speed_minutes?: number;
}

@Injectable()
export class BusinessProfileRepository {
  constructor(@Inject(DatabasePool) private readonly db: DatabasePool) {}

  async save(profile: BusinessProfile): Promise<void> {
    await this.db.query(
      `INSERT INTO business_profiles (
         id, name, description_ar, description_en, owner_user_id, organization_id,
         visibility, moderation_status, trust_status, status, phone, email, website,
         category_code, city_code, country_code, lat, lng, address_ar,
         is_featured, featured_at, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
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
         lat = EXCLUDED.lat,
         lng = EXCLUDED.lng,
         address_ar = EXCLUDED.address_ar,
         is_featured = EXCLUDED.is_featured,
         featured_at = EXCLUDED.featured_at,
         updated_at = EXCLUDED.updated_at`,
      [
        profile.id,
        profile.name,
        profile.descriptionAr ?? null,
        profile.descriptionEn ?? null,
        profile.ownerUserId,
        profile.organizationId ?? null,
        profile.visibility,
        profile.moderationStatus ?? 'pending',
        profile.trustStatus,
        profile.status,
        profile.phone ?? null,
        profile.email ?? null,
        profile.website ?? null,
        profile.categoryCode,
        profile.cityCode,
        profile.countryCode,
        profile.lat ?? null,
        profile.lng ?? null,
        profile.addressAr ?? null,
        profile.isFeatured ?? false,
        profile.featuredAt ?? null,
        profile.createdAt,
        profile.updatedAt
      ]
    );
  }

  async findById(id: string): Promise<BusinessProfile | undefined> {
    const rows = await this.db.query<BusinessProfileRow>(
      `SELECT id, name, description_ar, description_en, owner_user_id, organization_id, visibility, moderation_status, trust_status,
              status, phone, email, website, category_code, city_code, country_code,
              lat, lng, address_ar, is_featured, featured_at, created_at, updated_at,
              COALESCE(to_jsonb(b)->>'service_radius', to_jsonb(b)->>'service_radius_km') AS service_radius,
              to_jsonb(b)->>'availability' AS availability,
              to_jsonb(b)->>'rating' AS rating,
              to_jsonb(b)->>'response_speed_minutes' AS response_speed_minutes
       FROM business_profiles b
       WHERE id = $1
       LIMIT 1`,
      [id]
    );
    return rows[0] ? this.map(rows[0]) : undefined;
  }

  async listForUser(userId: string): Promise<BusinessProfile[]> {
    const rows = await this.db.query<BusinessProfileRow>(
      `SELECT id, name, description_ar, description_en, owner_user_id, organization_id, visibility, moderation_status, trust_status,
              status, phone, email, website, category_code, city_code, country_code,
              lat, lng, address_ar, is_featured, featured_at, created_at, updated_at,
              COALESCE(to_jsonb(b)->>'service_radius', to_jsonb(b)->>'service_radius_km') AS service_radius,
              to_jsonb(b)->>'availability' AS availability,
              to_jsonb(b)->>'rating' AS rating,
              to_jsonb(b)->>'response_speed_minutes' AS response_speed_minutes
       FROM business_profiles b
       WHERE owner_user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    return rows.map((row) => this.map(row));
  }

  async listPendingModeration(): Promise<BusinessProfile[]> {
    const rows = await this.db.query<BusinessProfileRow>(
      `SELECT id, name, description_ar, description_en, owner_user_id, organization_id, visibility, moderation_status, trust_status,
              status, phone, email, website, category_code, city_code, country_code,
              lat, lng, address_ar, is_featured, featured_at, created_at, updated_at,
              COALESCE(to_jsonb(b)->>'service_radius', to_jsonb(b)->>'service_radius_km') AS service_radius,
              to_jsonb(b)->>'availability' AS availability,
              to_jsonb(b)->>'rating' AS rating,
              to_jsonb(b)->>'response_speed_minutes' AS response_speed_minutes
       FROM business_profiles b
       WHERE moderation_status = 'pending'
       ORDER BY created_at ASC`
    );
    return rows.map((row) => this.map(row));
  }

  async listPublicApproved(filters: { categoryCode?: string; cityCode?: string; q?: string; boundaries?: { south: number; west: number; north: number; east: number } }, limit = 20, offset = 0): Promise<BusinessProfile[]> {
    const { where, params } = this.publicApprovedWhere(filters);
    const rows = await this.db.query<BusinessProfileRow>(
      `SELECT id, name, description_ar, description_en, owner_user_id, organization_id, visibility, moderation_status, trust_status,
              status, phone, email, website, category_code, city_code, country_code,
              lat, lng, address_ar, is_featured, featured_at, created_at, updated_at,
              COALESCE(to_jsonb(b)->>'service_radius', to_jsonb(b)->>'service_radius_km') AS service_radius,
              to_jsonb(b)->>'availability' AS availability,
              to_jsonb(b)->>'rating' AS rating,
              to_jsonb(b)->>'response_speed_minutes' AS response_speed_minutes
       FROM business_profiles b
       ${where}
       ORDER BY is_featured DESC, created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    return rows.map((row) => this.map(row));
  }

  async listFeatured(limit = 6): Promise<BusinessProfile[]> {
    const rows = await this.db.query<BusinessProfileRow>(
      `SELECT id, name, description_ar, description_en, owner_user_id, organization_id, visibility, moderation_status, trust_status,
              status, phone, email, website, category_code, city_code, country_code,
              lat, lng, address_ar, is_featured, featured_at, created_at, updated_at,
              COALESCE(to_jsonb(b)->>'service_radius', to_jsonb(b)->>'service_radius_km') AS service_radius,
              to_jsonb(b)->>'availability' AS availability,
              to_jsonb(b)->>'rating' AS rating,
              to_jsonb(b)->>'response_speed_minutes' AS response_speed_minutes
       FROM business_profiles b
       WHERE visibility = 'public' AND moderation_status = 'approved' AND trust_status = 'approved' AND status = 'active'
         AND LOWER(BTRIM(name)) NOT IN ('khedmah production test', 'خدمة production test') AND is_featured = TRUE
       ORDER BY featured_at DESC
       LIMIT $1`,
      [limit]
    );
    return rows.map((row) => this.map(row));
  }

  async listRecentlyAdded(limit = 10): Promise<BusinessProfile[]> {
    const rows = await this.db.query<BusinessProfileRow>(
      `SELECT id, name, description_ar, description_en, owner_user_id, organization_id, visibility, moderation_status, trust_status,
              status, phone, email, website, category_code, city_code, country_code,
              lat, lng, address_ar, is_featured, featured_at, created_at, updated_at,
              COALESCE(to_jsonb(b)->>'service_radius', to_jsonb(b)->>'service_radius_km') AS service_radius,
              to_jsonb(b)->>'availability' AS availability,
              to_jsonb(b)->>'rating' AS rating,
              to_jsonb(b)->>'response_speed_minutes' AS response_speed_minutes
       FROM business_profiles b
       WHERE visibility = 'public' AND moderation_status = 'approved' AND trust_status = 'approved' AND status = 'active'
         AND LOWER(BTRIM(name)) NOT IN ('khedmah production test', 'خدمة production test')
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    return rows.map((row) => this.map(row));
  }

  async countPublicApproved(filters: { categoryCode?: string; cityCode?: string; q?: string; boundaries?: { south: number; west: number; north: number; east: number } }): Promise<number> {
    const { where, params } = this.publicApprovedWhere(filters);
    const rows = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM business_profiles ${where}`,
      params
    );
    return Number.parseInt(rows[0]?.count ?? '0', 10);
  }

  async updateTrustStatus(id: string, trustStatus: BusinessProfileTrustStatus, updatedAt: string): Promise<void> {
    await this.db.query(
      `UPDATE business_profiles
       SET trust_status = $2, updated_at = $3
       WHERE id = $1`,
      [id, trustStatus, updatedAt]
    );
  }

  async updateModerationStatus(id: string, moderationStatus: BusinessProfile['moderationStatus'], updatedAt: string): Promise<void> {
    await this.db.query(
      `UPDATE business_profiles
       SET moderation_status = $2, updated_at = $3
       WHERE id = $1`,
      [id, moderationStatus, updatedAt]
    );
  }

  async saveMediaAsset(asset: MediaAsset): Promise<void> {
    await this.db.query(
      `INSERT INTO media_assets
         (id, owner_user_id, owner_type, owner_id, filename, mime_type, size_bytes, visibility,
          storage_key, public_url, asset_type, sort_order, created_at, updated_at)
       SELECT $1, b.owner_user_id, 'business_profile', $3, $1, $7, $8, 'public', $6, $5, $4, $9, $10, $10
       FROM business_profiles b WHERE b.id = $3
       ON CONFLICT (id) DO UPDATE SET public_url = EXCLUDED.public_url, sort_order = EXCLUDED.sort_order`,
      [asset.id, asset.entityType, asset.entityId, asset.assetType, asset.url, asset.storagePath, asset.mimeType, asset.sizeBytes, asset.sortOrder, asset.createdAt]
    );
  }

  async listMediaAssets(entityType: string, entityId: string, assetType?: string): Promise<MediaAsset[]> {
    const params: unknown[] = [entityType === 'business' ? 'business_profile' : entityType, entityId];
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

  async deleteMediaAsset(businessProfileId: string, id: string): Promise<void> {
    await this.db.query(`DELETE FROM media_assets WHERE id = $1 AND owner_type = 'business_profile' AND owner_id = $2`, [id, businessProfileId]);
  }

  async replaceOpeningHours(businessProfileId: string, hours: OpeningHours[]): Promise<void> {
    await this.db.transaction(async (client) => {
      await client.query(
        `DELETE FROM business_opening_hours WHERE business_profile_id = $1`,
        [businessProfileId]
      );
      for (const entry of hours) {
        await client.query(
          `INSERT INTO business_opening_hours
             (id, business_profile_id, day_of_week, open_time, close_time, is_closed, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
          [entry.id, businessProfileId, entry.dayOfWeek, entry.openTime, entry.closeTime, entry.isClosed]
        );
      }
    });
  }

  async listOpeningHours(businessProfileId: string): Promise<OpeningHours[]> {
    const rows = await this.db.query<{ id: string; business_profile_id: string; day_of_week: number; open_time: string; close_time: string; is_closed: boolean }>(
      `SELECT id, business_profile_id, day_of_week, open_time, close_time, is_closed
       FROM business_opening_hours
       WHERE business_profile_id = $1
       ORDER BY day_of_week ASC`,
      [businessProfileId]
    );
    return rows.map((r) => ({ id: r.id, businessProfileId: r.business_profile_id, dayOfWeek: r.day_of_week, openTime: r.open_time, closeTime: r.close_time, isClosed: r.is_closed }));
  }

  async saveBranch(branch: BusinessBranch): Promise<void> {
    await this.db.query(
      `INSERT INTO business_branches (id, business_profile_id, name_ar, name_en, address_ar, phone, city_code, lat, lng, is_main, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en, address_ar = EXCLUDED.address_ar,
         phone = EXCLUDED.phone, city_code = EXCLUDED.city_code, lat = EXCLUDED.lat, lng = EXCLUDED.lng, is_main = EXCLUDED.is_main, updated_at = NOW()`,
      [branch.id, branch.businessProfileId, branch.nameAr, branch.nameEn ?? null, branch.addressAr ?? null, branch.phone ?? null, branch.cityCode, branch.lat ?? null, branch.lng ?? null, branch.isMain]
    );
  }

  async listBranches(businessProfileId: string): Promise<BusinessBranch[]> {
    const rows = await this.db.query<{ id: string; business_profile_id: string; name_ar: string; name_en: string | null; address_ar: string | null; phone: string | null; city_code: string; lat: string | null; lng: string | null; is_main: boolean }>(
      `SELECT id, business_profile_id, name_ar, name_en, address_ar, phone, city_code, lat, lng, is_main
       FROM business_branches
       WHERE business_profile_id = $1
       ORDER BY is_main DESC, created_at ASC`,
      [businessProfileId]
    );
    return rows.map((r) => ({ id: r.id, businessProfileId: r.business_profile_id, nameAr: r.name_ar, nameEn: r.name_en ?? undefined, addressAr: r.address_ar ?? undefined, phone: r.phone ?? undefined, cityCode: r.city_code, lat: r.lat ? Number(r.lat) : undefined, lng: r.lng ? Number(r.lng) : undefined, isMain: r.is_main }));
  }

  async saveSocialLink(link: BusinessSocialLink): Promise<void> {
    await this.db.query(
      `INSERT INTO business_social_links (id, business_profile_id, platform, url, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (id) DO UPDATE SET platform = EXCLUDED.platform, url = EXCLUDED.url`,
      [link.id, link.businessProfileId, link.platform, link.url]
    );
  }

  async listSocialLinks(businessProfileId: string): Promise<BusinessSocialLink[]> {
    const rows = await this.db.query<{ id: string; business_profile_id: string; platform: string; url: string }>(
      `SELECT id, business_profile_id, platform, url FROM business_social_links WHERE business_profile_id = $1 ORDER BY created_at ASC`,
      [businessProfileId]
    );
    return rows.map((r) => ({ id: r.id, businessProfileId: r.business_profile_id, platform: r.platform, url: r.url }));
  }

  async deleteSocialLink(businessProfileId: string, id: string): Promise<void> {
    await this.db.query(`DELETE FROM business_social_links WHERE id = $1 AND business_profile_id = $2`, [id, businessProfileId]);
  }

  async saveVerificationRequest(req: VerificationRequest): Promise<void> {
    await this.db.query(
      `INSERT INTO verification_requests (id, entity_type, entity_id, requester_id, status, notes, reviewed_by, reviewed_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes, reviewed_by = EXCLUDED.reviewed_by, reviewed_at = EXCLUDED.reviewed_at, updated_at = NOW()`,
      [req.id, req.entityType, req.entityId, req.requesterId, req.status, req.notes ?? null, req.reviewedBy ?? null, req.reviewedAt ?? null]
    );
  }

  async findVerificationRequest(entityType: string, entityId: string): Promise<VerificationRequest | undefined> {
    const rows = await this.db.query<{ id: string; entity_type: string; entity_id: string; requester_id: string; status: string; notes: string | null; reviewed_by: string | null; reviewed_at: Date | null; created_at: Date; updated_at: Date }>(
      `SELECT id, entity_type, entity_id, requester_id, status, notes, reviewed_by, reviewed_at, created_at, updated_at
       FROM verification_requests WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [entityType, entityId]
    );
    if (!rows[0]) return undefined;
    const r = rows[0];
    return { id: r.id, entityType: r.entity_type as VerificationRequest['entityType'], entityId: r.entity_id, requesterId: r.requester_id, status: r.status as VerificationRequest['status'], notes: r.notes ?? undefined, reviewedBy: r.reviewed_by ?? undefined, reviewedAt: r.reviewed_at?.toISOString(), createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString() };
  }

  async saveTrustHistory(entry: TrustHistoryEntry): Promise<void> {
    await this.db.query(
      `INSERT INTO trust_history (id, entity_type, entity_id, old_status, new_status, changed_by, reason, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [entry.id, entry.entityType, entry.entityId, entry.oldStatus ?? null, entry.newStatus, entry.changedBy ?? null, entry.reason ?? null]
    );
  }

  async listTrustHistory(entityType: string, entityId: string): Promise<TrustHistoryEntry[]> {
    const rows = await this.db.query<{ id: string; entity_type: string; entity_id: string; old_status: string | null; new_status: string; changed_by: string | null; reason: string | null; created_at: Date }>(
      `SELECT id, entity_type, entity_id, old_status, new_status, changed_by, reason, created_at
       FROM trust_history WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at DESC`,
      [entityType, entityId]
    );
    return rows.map((r) => ({ id: r.id, entityType: r.entity_type, entityId: r.entity_id, oldStatus: r.old_status ?? undefined, newStatus: r.new_status, changedBy: r.changed_by ?? undefined, reason: r.reason ?? undefined, createdAt: r.created_at.toISOString() }));
  }

  private publicApprovedWhere(filters: { categoryCode?: string; cityCode?: string; q?: string; boundaries?: { south: number; west: number; north: number; east: number } }) {
    const clauses = ["visibility = 'public'", "moderation_status = 'approved'", "trust_status = 'approved'", "status = 'active'", "LOWER(BTRIM(name)) NOT IN ('khedmah production test', 'خدمة production test')"];
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
      clauses.push(`(name ILIKE $${params.length} OR COALESCE(description_ar, '') ILIKE $${params.length} OR COALESCE(description_en, '') ILIKE $${params.length} OR category_code ILIKE $${params.length})`);
    }
    if (filters.boundaries) {
      params.push(filters.boundaries.south, filters.boundaries.north, filters.boundaries.west, filters.boundaries.east);
      clauses.push(`lat BETWEEN $${params.length - 3} AND $${params.length - 2}`);
      clauses.push(`lng BETWEEN $${params.length - 1} AND $${params.length}`);
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
      moderationStatus: row.moderation_status as BusinessProfile['moderationStatus'],
      trustStatus: row.trust_status as BusinessProfile['trustStatus'],
      status: row.status as BusinessProfile['status'],
      phone: row.phone ?? undefined,
      email: row.email ?? undefined,
      website: row.website ?? undefined,
      categoryCode: row.category_code,
      cityCode: row.city_code,
      countryCode: row.country_code,
      lat: row.lat ? Number(row.lat) : undefined,
      lng: row.lng ? Number(row.lng) : undefined,
      addressAr: row.address_ar ?? undefined,
      isFeatured: row.is_featured,
      featuredAt: row.featured_at?.toISOString(),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      serviceRadius: Number(row.service_radius ?? 25),
      availability: (row.availability ?? 'available') as BusinessProfile['availability'],
      rating: Number(row.rating ?? 0),
      responseSpeedMinutes: Number(row.response_speed_minutes ?? 1440)
    };
  }

}
