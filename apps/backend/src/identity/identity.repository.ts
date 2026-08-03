import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { AuditLog, AuditEventType, UserAccount, UserProfile, UserSession } from './identity.types';

@Injectable()
export class IdentityRepository {
  constructor(@Inject(DatabasePool) private readonly db: DatabasePool) {}

  async findAccountByEmail(email: string): Promise<UserAccount | undefined> {
    const rows = await this.db.query<{
      id: string; email: string; password_hash: string; status: string;
      created_at: Date; updated_at: Date;
    }>(
      `SELECT id, email, password_hash, status, created_at, updated_at
       FROM user_accounts WHERE email = $1 LIMIT 1`,
      [email]
    );
    return rows[0] ? this.mapAccount(rows[0]) : undefined;
  }

  async findAccountById(id: string): Promise<UserAccount | undefined> {
    const rows = await this.db.query<{
      id: string; email: string; password_hash: string; status: string;
      created_at: Date; updated_at: Date;
    }>(
      `SELECT id, email, password_hash, status, created_at, updated_at
       FROM user_accounts WHERE id = $1 LIMIT 1`,
      [id]
    );
    return rows[0] ? this.mapAccount(rows[0]) : undefined;
  }

  async saveAccount(account: UserAccount): Promise<void> {
    await this.db.query(
      `INSERT INTO user_accounts (id, email, password_hash, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         password_hash = EXCLUDED.password_hash,
         status = EXCLUDED.status,
         updated_at = EXCLUDED.updated_at`,
      [account.id, account.email, account.passwordHash, account.status, account.createdAt, account.updatedAt]
    );
  }

  async findProfile(userId: string): Promise<UserProfile | undefined> {
    const rows = await this.db.query<{
      user_id: string; display_name: string; locale: string;
      created_at: Date; updated_at: Date;
    }>(
      `SELECT user_id, display_name, locale, created_at, updated_at
       FROM user_profiles WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    return rows[0] ? this.mapProfile(rows[0]) : undefined;
  }

  async saveProfile(profile: UserProfile): Promise<void> {
    await this.db.query(
      `INSERT INTO user_profiles (user_id, display_name, locale, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         locale = EXCLUDED.locale,
         updated_at = EXCLUDED.updated_at`,
      [profile.userId, profile.displayName, profile.locale, profile.createdAt, profile.updatedAt]
    );
  }

  async saveSession(session: UserSession): Promise<void> {
    await this.db.query(
      `INSERT INTO user_sessions (id, user_id, token_hash, expires_at, revoked_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         token_hash = EXCLUDED.token_hash,
         expires_at = EXCLUDED.expires_at,
         revoked_at = EXCLUDED.revoked_at`,
      [session.id, session.userId, session.tokenHash, session.expiresAt, session.revokedAt ?? null, session.createdAt]
    );
  }

  async findActiveSessionByTokenHash(tokenHash: string): Promise<UserSession | undefined> {
    const rows = await this.db.query<{
      id: string; user_id: string; token_hash: string;
      expires_at: Date; revoked_at: Date | null; created_at: Date;
    }>(
      `SELECT id, user_id, token_hash, expires_at, revoked_at, created_at
       FROM user_sessions
       WHERE token_hash = $1
         AND revoked_at IS NULL
         AND expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );
    return rows[0] ? this.mapSession(rows[0]) : undefined;
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.db.query(
      `UPDATE user_sessions SET revoked_at = NOW() WHERE id = $1`,
      [sessionId]
    );
  }

  async appendAuditLog(
    eventType: AuditEventType,
    context: Omit<AuditLog, 'id' | 'eventType' | 'occurredAt'> = {}
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO audit_logs (id, event_type, actor_user_id, request_id, correlation_id, occurred_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [randomUUID(), eventType, context.actorUserId ?? null, context.requestId ?? null, context.correlationId ?? null]
    );
  }

  async listAuditLogs(): Promise<readonly AuditLog[]> {
    const rows = await this.db.query<{
      id: string; event_type: string; actor_user_id: string | null;
      request_id: string | null; correlation_id: string | null; occurred_at: Date;
    }>(`SELECT * FROM audit_logs ORDER BY occurred_at DESC LIMIT 200`);
    return rows.map((r) => ({
      id: r.id,
      eventType: r.event_type as AuditEventType,
      actorUserId: r.actor_user_id ?? undefined,
      requestId: r.request_id ?? undefined,
      correlationId: r.correlation_id ?? undefined,
      occurredAt: r.occurred_at.toISOString()
    }));
  }

  private mapAccount(r: { id: string; email: string; password_hash: string; status: string; created_at: Date; updated_at: Date }): UserAccount {
    return {
      id: r.id,
      email: r.email,
      passwordHash: r.password_hash,
      status: r.status as UserAccount['status'],
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString()
    };
  }

  private mapProfile(r: { user_id: string; display_name: string; locale: string; created_at: Date; updated_at: Date }): UserProfile {
    return {
      userId: r.user_id,
      displayName: r.display_name,
      locale: 'ar',
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString()
    };
  }

  private mapSession(r: { id: string; user_id: string; token_hash: string; expires_at: Date; revoked_at: Date | null; created_at: Date }): UserSession {
    return {
      id: r.id,
      userId: r.user_id,
      tokenHash: r.token_hash,
      expiresAt: r.expires_at.toISOString(),
      revokedAt: r.revoked_at?.toISOString(),
      createdAt: r.created_at.toISOString()
    };
  }

  async hasAdminAccount(): Promise<boolean> {
    const rows = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM admin_roles WHERE role = 'bootstrap_admin' LIMIT 1`
    );
    return parseInt(rows[0]?.count ?? '0', 10) > 0;
  }

  async saveAdminRole(userId: string, role: string): Promise<void> {
    await this.db.query(
      `INSERT INTO admin_roles (id, user_id, role, granted_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, role) DO NOTHING`,
      [randomUUID(), userId, role]
    );
  }

  async findAdminRoles(userId: string): Promise<readonly string[]> {
    const rows = await this.db.query<{ role: string }>(
      `SELECT role FROM admin_roles WHERE user_id = $1`,
      [userId]
    );
    return rows.map((r) => r.role);
  }
}

