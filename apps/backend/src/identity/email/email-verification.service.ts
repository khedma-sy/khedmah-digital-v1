import { randomBytes } from 'node:crypto';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { HttpException, HttpStatus } from '@nestjs/common';
import { DatabasePool } from '../../database/database.pool';
import { IdentityRepository } from '../identity.repository';
import { createEmailProvider, EmailProvider } from './email-provider';

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const RESEND_WINDOW_MS = 60 * 1000; // 1 minute between resends
const MAX_RESENDS_PER_EMAIL = 5; // per 24-hour window

export interface EmailVerificationRecord {
  readonly id: string;
  readonly userId: string;
  readonly email: string;
  readonly tokenHash: string;
  readonly expiresAt: string;
  readonly confirmedAt?: string;
  readonly createdAt: string;
}

@Injectable()
export class EmailVerificationService {
  private readonly emailProvider: EmailProvider;

  constructor(
    @Inject(DatabasePool) private readonly db: DatabasePool,
    @Inject(IdentityRepository) private readonly repository: IdentityRepository
  ) {
    this.emailProvider = createEmailProvider();
  }

  async requestVerification(userId: string, email: string): Promise<void> {
    // Rate limit: no more than MAX_RESENDS_PER_EMAIL per 24 hours
    const recentCount = await this.countRecentVerifications(userId, TOKEN_TTL_MS);
    if (recentCount >= MAX_RESENDS_PER_EMAIL) {
      await this.repository.appendAuditLog('email.verification.requested', { actorUserId: userId });
      throw new HttpException('Too many verification emails sent. Please wait before requesting another.', HttpStatus.TOO_MANY_REQUESTS);
    }

    // Throttle: must wait RESEND_WINDOW_MS between requests
    const lastSent = await this.lastVerificationSentAt(userId);
    if (lastSent && Date.now() - lastSent < RESEND_WINDOW_MS) {
      throw new HttpException('Please wait before requesting another verification email.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS);

    await this.db.query(
      `INSERT INTO email_verifications (id, user_id, email, token_hash, expires_at, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())`,
      [userId, email, tokenHash, expiresAt.toISOString()]
    );

    await this.repository.appendAuditLog('email.verification.requested', { actorUserId: userId });

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://khedmah.digital';
    const verifyUrl = `${siteUrl}/auth/verify-email?token=${rawToken}`;

    await this.emailProvider.send({
      to: email,
      subject: 'تأكيد البريد الإلكتروني — خدمة الرقمية',
      textBody: [
        'مرحباً،',
        '',
        'لتأكيد بريدك الإلكتروني على منصة خدمة الرقمية، انقر على الرابط التالي:',
        '',
        verifyUrl,
        '',
        'صالح لمدة 24 ساعة.',
        'إذا لم تطلب هذا، يمكنك تجاهل هذا البريد.',
        '',
        'فريق خدمة الرقمية'
      ].join('\n')
    });
  }

  async confirmVerification(rawToken: string): Promise<{ userId: string; email: string }> {
    const tokenHash = this.hashToken(rawToken);

    const rows = await this.db.query<{
      id: string; user_id: string; email: string;
      expires_at: Date; confirmed_at: Date | null;
    }>(
      `SELECT id, user_id, email, expires_at, confirmed_at
       FROM email_verifications
       WHERE token_hash = $1 LIMIT 1`,
      [tokenHash]
    );

    const record = rows[0];
    if (!record) {
      throw new BadRequestException('Verification token is invalid or expired.');
    }
    if (record.confirmed_at) {
      throw new BadRequestException('Email has already been verified.');
    }
    if (new Date(record.expires_at) < new Date()) {
      await this.repository.appendAuditLog('email.verification.expired', { actorUserId: record.user_id });
      throw new BadRequestException('Verification token has expired. Please request a new one.');
    }

    await this.db.query(
      `UPDATE email_verifications SET confirmed_at = NOW() WHERE id = $1`,
      [record.id]
    );
    await this.db.query(
      `UPDATE core_user_accounts SET account_status = 'active', lifecycle_status = 'active', updated_at = NOW() WHERE user_identifier = $1`,
      [record.user_id]
    );

    await this.repository.appendAuditLog('email.verification.confirmed', { actorUserId: record.user_id });

    return { userId: record.user_id, email: record.email };
  }

  private hashToken(raw: string): string {
    const { createHash } = require('node:crypto');
    return createHash('sha256').update(raw).digest('base64url');
  }

  private async countRecentVerifications(userId: string, windowMs: number): Promise<number> {
    const since = new Date(Date.now() - windowMs).toISOString();
    const rows = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM email_verifications WHERE user_id = $1 AND created_at > $2`,
      [userId, since]
    );
    return parseInt(rows[0]?.count ?? '0', 10);
  }

  private async lastVerificationSentAt(userId: string): Promise<number | null> {
    const rows = await this.db.query<{ created_at: Date }>(
      `SELECT created_at FROM email_verifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    return rows[0] ? new Date(rows[0].created_at).getTime() : null;
  }
}
