/**
 * Bootstrap Administrator Service — IDENTITY-GOV-001
 *
 * One-time initialization mechanism for the first platform administrator.
 * Requirements:
 *   - One-time only: disabled after first successful execution.
 *   - No hardcoded credentials: all values sourced from environment variables.
 *   - Secure: password hashed with the platform's standard pbkdf2 algorithm.
 *   - Full audit logging via the identity repository.
 *   - Automatically disabled: the BOOTSTRAP_ADMIN_TOKEN env var is never
 *     stored in persistent state; completion is tracked in the database.
 */
import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { hashPassword } from './security/password-security';

export interface BootstrapAdminResult {
  readonly status: 'created' | 'already_completed' | 'disabled';
  readonly adminId?: string;
}

@Injectable()
export class BootstrapAdminService {
  private readonly logger = new Logger(BootstrapAdminService.name);

  constructor(@Inject(DatabasePool) private readonly db: DatabasePool) {}

  /**
   * Execute bootstrap if the BOOTSTRAP_ADMIN_TOKEN env var matches the provided
   * token and the bootstrap has not already been completed.
   *
   * Environment variables required:
   *   BOOTSTRAP_ADMIN_TOKEN  — secret one-time token authorising bootstrap
   *   BOOTSTRAP_ADMIN_EMAIL  — email address for the first administrator
   *   BOOTSTRAP_ADMIN_PASSWORD — initial password (min 12 chars)
   *   BOOTSTRAP_ADMIN_DISPLAY_NAME — display name (optional, defaults to 'Admin')
   */
  async execute(providedToken: string): Promise<BootstrapAdminResult> {
    const expectedToken = process.env.BOOTSTRAP_ADMIN_TOKEN;
    if (!expectedToken || expectedToken.length < 32) {
      this.logger.warn('Bootstrap admin: BOOTSTRAP_ADMIN_TOKEN not configured or too short — bootstrap disabled.');
      return { status: 'disabled' };
    }

    // Constant-time comparison to avoid timing attacks on the token.
    if (!timingSafeEqual(providedToken, expectedToken)) {
      this.logger.warn('Bootstrap admin: invalid token provided — access denied.');
      return { status: 'disabled' };
    }

    // Check whether bootstrap has already been completed.
    const alreadyDone = await this.isAlreadyCompleted();
    if (alreadyDone) {
      this.logger.log('Bootstrap admin: already completed — ignoring request.');
      return { status: 'already_completed' };
    }

    const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    const displayName = process.env.BOOTSTRAP_ADMIN_DISPLAY_NAME ?? 'Admin';

    if (!email || !password || password.length < 12) {
      this.logger.error('Bootstrap admin: BOOTSTRAP_ADMIN_EMAIL or BOOTSTRAP_ADMIN_PASSWORD missing or password too short.');
      return { status: 'disabled' };
    }

    const now = new Date().toISOString();
    const adminId = randomUUID();
    const passwordHash = hashPassword(password);

    await this.db.query(
      `INSERT INTO user_accounts (id, email, password_hash, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'active', $4, $4)
       ON CONFLICT (email) DO NOTHING`,
      [adminId, email.toLowerCase(), passwordHash, now]
    );

    await this.db.query(
      `INSERT INTO user_profiles (user_id, display_name, locale, created_at, updated_at)
       VALUES ($1, $2, 'ar', $3, $3)
       ON CONFLICT (user_id) DO NOTHING`,
      [adminId, displayName, now]
    );

    // Record completion marker to prevent re-execution.
    await this.db.query(
      `INSERT INTO bootstrap_completions (id, completed_at, admin_user_id)
       VALUES ($1, $2, $3)`,
      [randomUUID(), now, adminId]
    );

    // Audit log.
    await this.db.query(
      `INSERT INTO audit_logs (id, event_type, actor_user_id, request_id, correlation_id, occurred_at)
       VALUES ($1, 'bootstrap.admin.created', $2, NULL, NULL, $3)`,
      [randomUUID(), adminId, now]
    );

    this.logger.log(`Bootstrap admin: administrator account created (id=${adminId}).`);
    return { status: 'created', adminId };
  }

  async isAlreadyCompleted(): Promise<boolean> {
    const rows = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM bootstrap_completions`
    );
    return parseInt(rows[0]?.count ?? '0', 10) > 0;
  }
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still iterate to avoid short-circuit timing leak.
    let diff = 0;
    const maxLen = Math.max(a.length, b.length);
    for (let i = 0; i < maxLen; i++) {
      diff |= (a.charCodeAt(i) ?? 0) ^ (b.charCodeAt(i) ?? 0);
    }
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
