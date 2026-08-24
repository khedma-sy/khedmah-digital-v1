import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { IdentityRepository } from './identity.repository';
import { createEmailProvider, EmailProvider } from './email/email-provider';
import { hashPassword } from './security/password-security';

const RESET_TTL_MS = 60 * 60 * 1000;
const RESET_THROTTLE_MS = 60 * 1000;
const MAX_RESET_REQUESTS_24H = 5;

@Injectable()
export class PasswordRecoveryService {
  private readonly emailProvider: EmailProvider;

  constructor(
    @Inject(DatabasePool) private readonly db: DatabasePool,
    @Inject(IdentityRepository) private readonly repository: IdentityRepository
  ) {
    this.emailProvider = createEmailProvider();
  }

  async requestReset(rawEmail: unknown): Promise<void> {
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
    if (!email) return;

    const account = await this.repository.findAccountByEmail(email);
    if (!account || account.status === 'archived' || account.status === 'suspended') {
      return;
    }

    const recent = await this.db.query<{ count: string; last_created_at: Date | null }>(
      `SELECT COUNT(*)::text AS count, MAX(created_at) AS last_created_at
       FROM password_reset_tokens
       WHERE user_identifier = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
      [account.id]
    );
    const count = Number.parseInt(recent[0]?.count ?? '0', 10);
    const last = recent[0]?.last_created_at ? new Date(recent[0].last_created_at).getTime() : 0;
    if (count >= MAX_RESET_REQUESTS_24H || (last && Date.now() - last < RESET_THROTTLE_MS)) {
      return;
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('base64url');
    const expiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();

    await this.db.query(
      `INSERT INTO password_reset_tokens
         (reset_identifier, user_identifier, token_hash, expires_at, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [randomUUID(), account.id, tokenHash, expiresAt]
    );
    await this.repository.appendAuditLog('auth.password_reset_requested', { actorUserId: account.id });

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://khedmah.digital';
    const resetUrl = `${siteUrl}/auth/reset-password?token=${encodeURIComponent(rawToken)}`;
    await this.emailProvider.send({
      to: account.email,
      subject: 'إعادة تعيين كلمة المرور — خدمة',
      textBody: [
        'مرحباً،',
        '',
        'تم طلب إعادة تعيين كلمة المرور لحسابك في خدمة.',
        'استخدم الرابط التالي خلال ساعة واحدة:',
        '',
        resetUrl,
        '',
        'إذا لم تطلب هذا الإجراء فتجاهل الرسالة.'
      ].join('\n')
    });
  }

  async resetPassword(rawToken: unknown, rawPassword: unknown): Promise<void> {
    const token = typeof rawToken === 'string' ? rawToken.trim() : '';
    const password = typeof rawPassword === 'string' ? rawPassword : '';
    if (!token || password.length < 8) {
      throw new BadRequestException('A valid reset token and password of at least 8 characters are required.');
    }

    const tokenHash = createHash('sha256').update(token).digest('base64url');
    const rows = await this.db.query<{ reset_identifier: string; user_identifier: string }>(
      `SELECT reset_identifier, user_identifier
       FROM password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );
    const record = rows[0];
    if (!record) {
      throw new BadRequestException('Reset token is invalid or expired.');
    }

    await this.db.transaction(async (client) => {
      const consumed = await client.query(
        `UPDATE password_reset_tokens
         SET used_at = NOW()
         WHERE reset_identifier = $1 AND used_at IS NULL
         RETURNING reset_identifier`,
        [record.reset_identifier]
      );
      if (consumed.rowCount !== 1) {
        throw new BadRequestException('Reset token is invalid or expired.');
      }
      await client.query(
        `UPDATE identity_credentials SET password_hash = $1, updated_at = NOW() WHERE user_identifier = $2`,
        [hashPassword(password), record.user_identifier]
      );
      await client.query(
        `UPDATE identity_sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE user_identifier = $1`,
        [record.user_identifier]
      );
      await client.query(
        `UPDATE password_reset_tokens
         SET used_at = COALESCE(used_at, NOW())
         WHERE user_identifier = $1 AND used_at IS NULL`,
        [record.user_identifier]
      );
    });

    await this.repository.appendAuditLog('auth.password_reset_completed', { actorUserId: record.user_identifier });
  }
}
