import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabasePool } from './database.pool';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS user_accounts (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id      TEXT PRIMARY KEY REFERENCES user_accounts(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  locale       TEXT NOT NULL DEFAULT 'ar',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_sessions_token_hash_idx ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx ON user_sessions(user_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id              TEXT PRIMARY KEY,
  event_type      TEXT NOT NULL,
  actor_user_id   TEXT,
  request_id      TEXT,
  correlation_id  TEXT,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_event_type_idx ON audit_logs(event_type);

CREATE TABLE IF NOT EXISTS organizations (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  owner_user_id  TEXT NOT NULL REFERENCES user_accounts(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organization_members (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES user_accounts(id),
  role            TEXT NOT NULL CHECK (role IN ('owner','member')),
  status          TEXT NOT NULL CHECK (status IN ('active','removed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS org_members_user_id_idx ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS org_members_org_id_idx ON organization_members(organization_id);

CREATE TABLE IF NOT EXISTS contact_inquiries (
  id                  TEXT PRIMARY KEY,
  business_profile_id TEXT NOT NULL,
  submitter_user_id   TEXT NOT NULL REFERENCES user_accounts(id),
  name                TEXT NOT NULL,
  contact_email       TEXT NOT NULL,
  message             TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'submitted',
  request_id          TEXT,
  correlation_id      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contact_inquiries_business_idx ON contact_inquiries(business_profile_id);

CREATE TABLE IF NOT EXISTS contact_actions (
  id                  TEXT PRIMARY KEY,
  business_profile_id TEXT NOT NULL,
  actor_user_id       TEXT,
  action_type         TEXT NOT NULL,
  request_id          TEXT,
  correlation_id      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contact_actions_business_idx ON contact_actions(business_profile_id);

CREATE TABLE IF NOT EXISTS analytics_events (
  id                TEXT PRIMARY KEY,
  event_type        TEXT NOT NULL,
  entity_type       TEXT NOT NULL,
  entity_id         TEXT NOT NULL,
  occurred_at       TIMESTAMPTZ NOT NULL,
  anonymous_id      TEXT,
  session_reference TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}',
  request_id        TEXT,
  correlation_id    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS analytics_events_entity_idx ON analytics_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS analytics_events_type_idx ON analytics_events(event_type);

CREATE TABLE IF NOT EXISTS business_profiles (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description_ar  TEXT,
  description_en  TEXT,
  owner_user_id   TEXT NOT NULL REFERENCES user_accounts(id),
  organization_id TEXT REFERENCES organizations(id),
  visibility      TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('public','private')),
  trust_status    TEXT NOT NULL DEFAULT 'pending' CHECK (trust_status IN ('pending','approved','suspended')),
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  phone           TEXT,
  email           TEXT,
  website         TEXT,
  category_code   TEXT NOT NULL,
  city_code       TEXT NOT NULL,
  country_code    TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS business_profiles_owner_idx ON business_profiles(owner_user_id);
CREATE INDEX IF NOT EXISTS business_profiles_visibility_trust_idx ON business_profiles(visibility, trust_status);
CREATE INDEX IF NOT EXISTS business_profiles_category_idx ON business_profiles(category_code);
CREATE INDEX IF NOT EXISTS business_profiles_city_idx ON business_profiles(city_code);

CREATE TABLE IF NOT EXISTS professional_profiles (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL UNIQUE REFERENCES user_accounts(id),
  headline_ar  TEXT NOT NULL,
  headline_en  TEXT,
  bio_ar       TEXT,
  bio_en       TEXT,
  availability TEXT NOT NULL DEFAULT 'available' CHECK (availability IN ('available','busy','unavailable')),
  city_code    TEXT NOT NULL,
  country_code TEXT NOT NULL,
  skills       TEXT[] NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS professional_profiles_user_idx ON professional_profiles(user_id);
CREATE INDEX IF NOT EXISTS professional_profiles_city_idx ON professional_profiles(city_code, availability);

CREATE TABLE IF NOT EXISTS service_listings (
  id             TEXT PRIMARY KEY,
  owner_type     TEXT NOT NULL CHECK (owner_type IN ('business','professional')),
  owner_id       TEXT NOT NULL,
  title_ar       TEXT NOT NULL,
  title_en       TEXT,
  description_ar TEXT,
  description_en TEXT,
  category_code  TEXT NOT NULL,
  price          NUMERIC,
  price_currency TEXT DEFAULT 'SYP',
  price_type     TEXT NOT NULL DEFAULT 'negotiable' CHECK (price_type IN ('fixed','hourly','negotiable')),
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS service_listings_owner_idx ON service_listings(owner_id, owner_type);
CREATE INDEX IF NOT EXISTS service_listings_category_idx ON service_listings(category_code, status);
`;

@Injectable()
export class DatabaseMigrator implements OnModuleInit {
  private readonly logger = new Logger(DatabaseMigrator.name);

  constructor(@Inject(DatabasePool) private readonly pool: DatabasePool) {}

  async onModuleInit(): Promise<void> {
    await this.pool.query(SCHEMA_SQL);
    this.logger.log('Database schema applied.');
  }
}
