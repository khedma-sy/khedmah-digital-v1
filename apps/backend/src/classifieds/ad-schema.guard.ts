import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';

export const REQUIRED_CLASSIFIEDS_SCHEMA_VERSION = '025';

interface ClassifiedsSchemaReadinessRow extends Record<string, unknown> {
  ready: boolean;
}

export class ClassifiedsSchemaError extends Error {
  constructor() {
    super(`CLASSIFIEDS_SCHEMA_INCOMPATIBLE required=${REQUIRED_CLASSIFIEDS_SCHEMA_VERSION}`);
    this.name = 'ClassifiedsSchemaError';
  }
}

export function verifyClassifiedsSchema(rows: readonly ClassifiedsSchemaReadinessRow[]): void {
  if (rows[0]?.ready !== true) throw new ClassifiedsSchemaError();
}

export const CLASSIFIEDS_SCHEMA_READINESS_QUERY = `
SELECT (
  to_regclass(current_schema() || '.ad_listings') IS NOT NULL
  AND to_regclass(current_schema() || '.ad_free_slots') IS NOT NULL
  AND to_regclass(current_schema() || '.ad_request_receipts') IS NOT NULL
  AND to_regclass(current_schema() || '.ad_moderation_events') IS NOT NULL
  AND to_regprocedure(current_schema() || '.enforce_ad_free_slot_limit()') IS NOT NULL
  AND to_regprocedure(current_schema() || '.protect_ad_listing_identity()') IS NOT NULL
  AND to_regprocedure(current_schema() || '.reject_ad_audit_mutation()') IS NOT NULL
  AND (SELECT count(*) = 4 FROM pg_indexes
       WHERE schemaname=current_schema()
         AND indexname IN ('ad_listings_owner_created_idx','ad_listings_public_idx','ad_listings_pending_idx','ad_free_slots_owner_idx'))
  AND (SELECT count(*) = 5 FROM pg_trigger t
       JOIN pg_class c ON c.oid=t.tgrelid
       JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname=current_schema() AND NOT t.tgisinternal
         AND t.tgname IN ('ad_free_slot_limit_before_insert','ad_listing_identity_before_update','ad_free_slots_append_only','ad_request_receipts_append_only','ad_moderation_events_append_only'))
  AND EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname=current_schema() AND t.relname='media_assets'
      AND c.conname='media_assets_owner_type_check'
      AND pg_get_constraintdef(c.oid) LIKE '%ad_listing%'
  )
  AND EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname=current_schema() AND t.relname='media_assets'
      AND c.conname='media_assets_asset_type_check'
      AND pg_get_constraintdef(c.oid) LIKE '%ad_image%'
  )
) AS ready`;

@Injectable()
export class AdSchemaGuard implements OnModuleInit {
  constructor(@Inject(DatabasePool) private readonly db: DatabasePool) {}

  async onModuleInit(): Promise<void> {
    if (process.env.CLASSIFIEDS_ENABLED !== 'true') return;
    verifyClassifiedsSchema(await this.db.query<ClassifiedsSchemaReadinessRow>(CLASSIFIEDS_SCHEMA_READINESS_QUERY));
  }
}
