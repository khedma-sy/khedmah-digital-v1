import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { AuditLog, AuditEventType, UserAccount, UserProfile, UserSession } from './identity.types';

@Injectable()
export class IdentityRepository {
  constructor(@Inject(DatabasePool) private readonly db: DatabasePool) {}

  async findAccountByEmail(email: string): Promise<UserAccount | undefined> {
    const rows = await this.db.query<{
      user_identifier: string; email: string; password_hash: string; account_status: string;
      created_at: Date; updated_at: Date;
    }>(
      `SELECT a.user_identifier, c.email, c.password_hash, a.account_status, a.created_at, a.updated_at
       FROM core_user_accounts a JOIN identity_credentials c USING (user_identifier)
       WHERE c.email = $1 LIMIT 1`,
      [email]
    );
    return rows[0] ? this.mapAccount(rows[0]) : undefined;
  }

  async findAccountById(id: string): Promise<UserAccount | undefined> {
    const rows = await this.db.query<{
      user_identifier: string; email: string; password_hash: string; account_status: string;
      created_at: Date; updated_at: Date;
    }>(
      `SELECT a.user_identifier, c.email, c.password_hash, a.account_status, a.created_at, a.updated_at
       FROM core_user_accounts a JOIN identity_credentials c USING (user_identifier)
       WHERE a.user_identifier = $1 LIMIT 1`,
      [id]
    );
    return rows[0] ? this.mapAccount(rows[0]) : undefined;
  }

  async saveAccount(account: UserAccount): Promise<void> {
    await this.db.transaction(async (client) => {
      await client.query(
        `INSERT INTO core_user_accounts
           (user_identifier, identity_reference, account_type, account_status, lifecycle_status, visibility_classification, created_at, updated_at)
         VALUES ($1,$2,'individual_user',$3,$3,'private',$4,$5)
         ON CONFLICT (user_identifier) DO UPDATE SET account_status=EXCLUDED.account_status,
           lifecycle_status=EXCLUDED.lifecycle_status, updated_at=EXCLUDED.updated_at`,
        [account.id, `identity_${account.id.replaceAll('-', '')}`, account.status, account.createdAt, account.updatedAt]
      );
      await client.query(
        `INSERT INTO identity_credentials (user_identifier,email,password_hash,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (user_identifier) DO UPDATE SET email=EXCLUDED.email,password_hash=EXCLUDED.password_hash,updated_at=EXCLUDED.updated_at`,
        [account.id, account.email, account.passwordHash, account.createdAt, account.updatedAt]
      );
    });
  }

  async findProfile(userId: string): Promise<UserProfile | undefined> {
    const rows = await this.db.query<{
      user_identifier: string; display_name: string; locale: string;
      created_at: Date; updated_at: Date;
    }>(
      `SELECT user_identifier, display_name, locale, created_at, updated_at
       FROM profiles WHERE user_identifier = $1 LIMIT 1`,
      [userId]
    );
    return rows[0] ? this.mapProfile(rows[0]) : undefined;
  }

  async saveProfile(profile: UserProfile): Promise<void> {
    await this.db.query(
      `INSERT INTO profiles (profile_identifier, user_identifier, profile_type, display_name, lifecycle_status, visibility, locale, created_at, updated_at)
       VALUES ($1, $2, 'personal_profile', $3, 'active', 'private', $4, $5, $6)
       ON CONFLICT (user_identifier) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         locale = EXCLUDED.locale,
         updated_at = EXCLUDED.updated_at`,
      [`profile_${profile.userId.replaceAll('-', '')}`, profile.userId, profile.displayName, profile.locale, profile.createdAt, profile.updatedAt]
    );
  }

  async saveSession(session: UserSession): Promise<void> {
    await this.db.query(
      `INSERT INTO identity_sessions (session_identifier, user_identifier, token_hash, expires_at, revoked_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (session_identifier) DO UPDATE SET
         token_hash = EXCLUDED.token_hash,
         expires_at = EXCLUDED.expires_at,
         revoked_at = EXCLUDED.revoked_at`,
      [session.id, session.userId, session.tokenHash, session.expiresAt, session.revokedAt ?? null, session.createdAt]
    );
  }

  async findActiveSessionByTokenHash(tokenHash: string): Promise<UserSession | undefined> {
    const rows = await this.db.query<{
      session_identifier: string; user_identifier: string; token_hash: string;
      expires_at: Date; revoked_at: Date | null; created_at: Date;
    }>(
      `SELECT session_identifier, user_identifier, token_hash, expires_at, revoked_at, created_at
       FROM identity_sessions
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
      `UPDATE identity_sessions SET revoked_at = NOW() WHERE session_identifier = $1`,
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

  async countAuditEvents(eventTypes: readonly AuditEventType[], periodDays: number): Promise<Record<string, number>> {
    const rows = await this.db.query<{ event_type: string; count: string }>(
      `SELECT event_type, COUNT(*)::text AS count
       FROM audit_logs
       WHERE event_type = ANY($1::text[])
         AND occurred_at >= NOW() - ($2 * INTERVAL '1 day')
       GROUP BY event_type`,
      [eventTypes, periodDays]
    );
    return Object.fromEntries(eventTypes.map((eventType) => [
      eventType,
      Number(rows.find((row) => row.event_type === eventType)?.count ?? 0)
    ]));
  }

  private mapAccount(r: { user_identifier: string; email: string; password_hash: string; account_status: string; created_at: Date; updated_at: Date }): UserAccount {
    return {
      id: r.user_identifier,
      email: r.email,
      passwordHash: r.password_hash,
      status: r.account_status as UserAccount['status'],
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString()
    };
  }

  private mapProfile(r: { user_identifier: string; display_name: string; locale: string; created_at: Date; updated_at: Date }): UserProfile {
    return {
      userId: r.user_identifier,
      displayName: r.display_name,
      locale: 'ar',
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString()
    };
  }

  private mapSession(r: { session_identifier: string; user_identifier: string; token_hash: string; expires_at: Date; revoked_at: Date | null; created_at: Date }): UserSession {
    return {
      id: r.session_identifier,
      userId: r.user_identifier,
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
