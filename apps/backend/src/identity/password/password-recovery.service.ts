import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DatabasePool } from '../../database/database.pool';
import { IdentityRepository } from '../identity.repository';
import { normalizeEmail, validatePassword } from '../identity.validation';
import { createEmailProvider, type EmailProvider } from '../email/email-provider';

const RESET_TTL_MS = 30 * 60 * 1000;
const RESET_REQUEST_WINDOW_MS = 60 * 1000;
const GENERIC_MESSAGE = 'If the email exists, a password reset link has been sent.';

@Injectable()
export class PasswordRecoveryService {
  private readonly emailProvider: EmailProvider;

  constructor(
    @Inject(DatabasePool) private readonly db: DatabasePool,
    @Inject(IdentityRepository) private readonly repository: IdentityRepository
  ) {
    this.emailProvider = createEmailProvider();
  }

  async requestReset(emailInput: unknown): Promise<{ message: string }> {
    const email = normalizeEmail(emailInput);
    const account = await this.repository.findAccountByEmail(email);
    if (!account) return { message: GENERIC_MESSAGE };

    const recent = await this.db.query<{ created_at: Date }>(
      `SELECT created_at FROM password_reset_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [account.id]
    );
    if (recent[0] && Date.now() - new Date(recent[0].created_at).getTime() < RESET_REQUEST_WINDOW_MS) {
      return { message: GENERIC_MESSAGE };
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();

    await this.db.query(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, NOW())`,
      [account.id, tokenHash, expiresAt]
    );

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://khedmah.digital').replace(/\/$/, '');
    const resetUrl = `${siteUrl}/auth/reset-password?token=${encodeURIComponent(rawToken)}`;
    await this.emailProvider.send({
      to: account.email,
      subject: 'إعادة تعيين كلمة المرور — خدمة',
      textBody: [
        'مرحباً،',
        '',
        'طلبت إعادة تعيين كلمة المرور لحسابك في خدمة.',
        'استخدم الرابط التالي خلال 30 دقيقة:',
        '',
        resetUrl,
        '',
        'إذا لم تطلب ذلك، تجاهل هذه الرسالة.'
      ].join('\n')
    });

    await this.repository.appendAuditLog('auth.password_reset_requested', { actorUserId: account.id });
    return { message: GENERIC_MESSAGE };
  }

  async resetPassword(rawTokenInput: unknown, passwordInput: unknown): Promise<{ message: string }> {
    if (typeof rawTokenInput !== 'string' || rawTokenInput.length < 20) {
      throw new BadRequestException('Password reset token is invalid or expired.');
    }
    const newPassword = validatePassword(passwordInput);
    const tokenHash = this.hashToken(rawTokenInput);

    const rows = await this.db.query<{ id: string; user_id: string; expires_at: Date; used_at: Date | null }>(
      `SELECT id, user_id, expires_at, used_at
       FROM password_reset_tokens
       WHERE token_hash = $1 LIMIT 1`,
      [tokenHash]
    );
    const token = rows[0];
    if (!token || token.used_at || new Date(token.expires_at).getTime() <= Date.now()) {
      throw new BadRequestException('Password reset token is invalid or expired.');
    }

    await this.db.transaction(async (client) => {
      await client.query(
        `UPDATE identity_credentials SET password_hash = $1, updated_at = NOW() WHERE user_identifier = $2`,
        [this.repository.hashPasswordForRecovery(newPassword), token.user_id]
      );
      await client.query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`, [token.id]);
      await client.query(`UPDATE identity_sessions SET revoked_at = NOW() WHERE user_identifier = $1 AND revoked_at IS NULL`, [token.user_id]);
    });

    await this.repository.appendAuditLog('auth.password_reset_completed', { actorUserId: token.user_id });
    return { message: 'Password reset successful.' };
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('base64url');
  }
}
