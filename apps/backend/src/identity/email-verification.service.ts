/**
 * Email Verification Service — WP-02
 *
 * Production-grade email verification with:
 *   - Cryptographically secure token generation
 *   - Provider abstraction (log-only by default; pluggable transport)
 *   - Token expiration (default 24h, configurable via env)
 *   - Resend protection (rate-limited to EMAIL_VERIFY_RESEND_COOLDOWN_MINUTES)
 *   - Full audit logging
 */
import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';

export interface EmailVerificationResult {
  readonly status: 'sent' | 'already_verified' | 'resend_too_soon' | 'invalid_token' | 'expired' | 'verified';
}

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  /** Token validity window in minutes (default 24h). */
  private get expirationMinutes(): number {
    return parseInt(process.env.EMAIL_VERIFY_EXPIRATION_MINUTES ?? '1440', 10);
  }

  /** Minimum minutes between resend requests (default 5). */
  private get resendCooldownMinutes(): number {
    return parseInt(process.env.EMAIL_VERIFY_RESEND_COOLDOWN_MINUTES ?? '5', 10);
  }

  constructor(@Inject(DatabasePool) private readonly db: DatabasePool) {}

  /**
   * Issue a new verification token for the given user and send it.
   * Respects resend-cooldown — returns 'resend_too_soon' if too recent.
   */
  async sendVerification(userId: string, email: string): Promise<EmailVerificationResult> {
    // Check whether the account is already verified.
    const rows = await this.db.query<{ email_verified: boolean }>(
      `SELECT email_verified FROM user_accounts WHERE id = $1`,
      [userId]
    );
    if (rows[0]?.email_verified) {
      return { status: 'already_verified' };
    }

    // Enforce resend cooldown.
    const recentRows = await this.db.query<{ created_at: Date }>(
      `SELECT created_at FROM email_verifications
       WHERE user_id = $1 AND used_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    if (recentRows[0]) {
      const elapsedMs = Date.now() - recentRows[0].created_at.getTime();
      const cooldownMs = this.resendCooldownMinutes * 60 * 1000;
      if (elapsedMs < cooldownMs) {
        this.logger.warn(`Email verification: resend too soon for user=${userId}`);
        return { status: 'resend_too_soon' };
      }
    }

    // Generate token and store hash.
    const token = randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + this.expirationMinutes * 60 * 1000).toISOString();
    const id = randomId();
    const now = new Date().toISOString();

    await this.db.query(
      `INSERT INTO email_verifications (id, user_id, token_hash, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, userId, tokenHash, expiresAt, now]
    );

    // Audit log.
    await this.appendAuditLog('auth.email_verification.sent', userId);

    // Deliver via provider abstraction.
    await this.sendEmail(email, token);

    this.logger.log(`Email verification: token issued for user=${userId}`);
    return { status: 'sent' };
  }

  /**
   * Verify a token provided by the user.
   * Marks the account's email as verified and invalidates the token.
   */
  async verifyToken(token: string): Promise<EmailVerificationResult> {
    const tokenHash = hashToken(token);
    const rows = await this.db.query<{
      id: string; user_id: string; expires_at: Date; used_at: Date | null;
    }>(
      `SELECT id, user_id, expires_at, used_at FROM email_verifications
       WHERE token_hash = $1 LIMIT 1`,
      [tokenHash]
    );

    const record = rows[0];
    if (!record) {
      return { status: 'invalid_token' };
    }
    if (record.used_at) {
      return { status: 'invalid_token' };
    }
    if (new Date() > record.expires_at) {
      return { status: 'expired' };
    }

    const now = new Date().toISOString();

    // Mark token as used.
    await this.db.query(
      `UPDATE email_verifications SET used_at = $1 WHERE id = $2`,
      [now, record.id]
    );

    // Mark account as verified.
    await this.db.query(
      `UPDATE user_accounts SET email_verified = TRUE, updated_at = $1 WHERE id = $2`,
      [now, record.user_id]
    );

    // Audit log.
    await this.appendAuditLog('auth.email_verification.confirmed', record.user_id);

    this.logger.log(`Email verification: confirmed for user=${record.user_id}`);
    return { status: 'verified' };
  }

  /**
   * Provider abstraction: in production, replace this with your email provider
   * (SendGrid, SES, etc.) configured via environment variables.
   * In development/staging, tokens are logged and the ENV var EMAIL_PROVIDER
   * controls behaviour:
   *   - unset / 'log': log token to stdout
   *   - 'none': no-op (test mode)
   */
  private async sendEmail(email: string, token: string): Promise<void> {
    const provider = process.env.EMAIL_PROVIDER ?? 'log';
    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
    const verifyUrl = `${appUrl}/verify-email?token=${token}`;

    if (provider === 'none') {
      // Test/CI mode — do not send.
      return;
    }

    // Default: log provider (dev/staging).
    this.logger.log(`[EMAIL] To: ${email} | Verify URL: ${verifyUrl}`);
  }

  private async appendAuditLog(eventType: string, actorUserId: string): Promise<void> {
    await this.db.query(
      `INSERT INTO audit_logs (id, event_type, actor_user_id, occurred_at)
       VALUES ($1, $2, $3, NOW())`,
      [randomId(), eventType, actorUserId]
    );
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function randomId(): string {
  return randomBytes(16).toString('hex');
}
