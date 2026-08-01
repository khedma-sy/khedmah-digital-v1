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
