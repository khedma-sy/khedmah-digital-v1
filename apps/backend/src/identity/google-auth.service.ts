import { randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { IdentityRepository } from './identity.repository';
import { PublicUserProfile, UserAccount, UserProfile } from './identity.types';
import { hashPassword } from './security/password-security';
import { SessionTokenService } from './security/session-token.service';

interface FirebaseAccountLookupResponse {
  users?: Array<{
    localId?: string;
    email?: string;
    emailVerified?: boolean;
    displayName?: string;
    providerUserInfo?: Array<{ providerId?: string; rawId?: string }>;
  }>;
}

type ExternalProvider = 'google' | 'facebook';

export interface GoogleAuthResult {
  readonly sessionToken: string;
  readonly user: PublicUserProfile;
}

@Injectable()
export class GoogleAuthService {
  constructor(
    @Inject(DatabasePool) private readonly db: DatabasePool,
    @Inject(IdentityRepository) private readonly repository: IdentityRepository,
    @Inject(SessionTokenService) private readonly sessionTokens: SessionTokenService
  ) {}

  async signIn(rawIdToken: unknown, provider: ExternalProvider = 'google'): Promise<GoogleAuthResult> {
    const idToken = typeof rawIdToken === 'string' ? rawIdToken.trim() : '';
    if (!idToken) throw new UnauthorizedException(`${provider} authentication failed.`);

    const firebaseApiKey = process.env.FIREBASE_API_KEY?.trim();
    if (!firebaseApiKey) {
      throw new Error('CRITICAL: FIREBASE_API_KEY is required for social sign-in verification.');
    }

    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseApiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    });
    if (!response.ok) {
      await this.repository.appendAuditLog(`auth.${provider}_login_failed`);
      throw new UnauthorizedException(`${provider} authentication failed.`);
    }

    const payload = await response.json() as FirebaseAccountLookupResponse;
    const external = payload.users?.[0];
    const providerId = provider === 'google' ? 'google.com' : 'facebook.com';
    const providerIdentity = external?.providerUserInfo?.find((item) => item.providerId === providerId);
    const subject = providerIdentity?.rawId?.trim() || external?.localId?.trim() || '';
    const email = external?.email?.trim().toLowerCase() ?? '';
    if (!subject || !email || external?.emailVerified !== true || !providerIdentity) {
      await this.repository.appendAuditLog(`auth.${provider}_login_failed`);
      throw new UnauthorizedException(`${provider} authentication failed.`);
    }

    const bound = await this.db.query<{ user_identifier: string }>(
      `SELECT user_identifier FROM external_identities
       WHERE provider = $1 AND provider_subject = $2 LIMIT 1`,
      [provider, subject]
    );

    let account = bound[0]
      ? await this.repository.findAccountById(bound[0].user_identifier)
      : await this.repository.findAccountByEmail(email);
    let profile = account ? await this.repository.findProfile(account.id) : undefined;

    if (account && (account.status === 'suspended' || account.status === 'archived')) {
      await this.repository.appendAuditLog(`auth.${provider}_login_failed`, { actorUserId: account.id });
      throw new UnauthorizedException(`${provider} authentication failed.`);
    }

    if (!account) {
      const now = new Date().toISOString();
      const userId = randomUUID();
      account = {
        id: userId,
        email,
        passwordHash: hashPassword(randomBytes(32).toString('base64url')),
        status: 'active',
        createdAt: now,
        updatedAt: now
      } satisfies UserAccount;
      profile = {
        userId,
        displayName: external.displayName?.trim() || email.split('@')[0] || 'مستخدم خدمة',
        locale: 'ar',
        createdAt: now,
        updatedAt: now
      } satisfies UserProfile;
      await this.repository.saveAccount(account);
      await this.repository.saveProfile(profile);
    } else if (account.status !== 'active') {
      await this.db.query(
        `UPDATE core_user_accounts
         SET account_status = 'active', lifecycle_status = 'active', updated_at = NOW()
         WHERE user_identifier = $1`,
        [account.id]
      );
      account = { ...account, status: 'active', updatedAt: new Date().toISOString() };
    }

    if (!profile) {
      const now = new Date().toISOString();
      profile = {
        userId: account.id,
        displayName: external.displayName?.trim() || email.split('@')[0] || 'مستخدم خدمة',
        locale: 'ar',
        createdAt: now,
        updatedAt: now
      };
      await this.repository.saveProfile(profile);
    }

    await this.db.query(
      `INSERT INTO external_identities (provider, provider_subject, user_identifier, email, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (provider, provider_subject) DO UPDATE
       SET email = EXCLUDED.email`,
      [provider, subject, account.id, email]
    );

    const sessionToken = this.sessionTokens.createToken();
    await this.repository.saveSession({
      id: randomUUID(),
      userId: account.id,
      tokenHash: this.sessionTokens.hashToken(sessionToken),
      expiresAt: this.sessionTokens.expiresAt(),
      createdAt: new Date().toISOString()
    });

    await this.repository.appendAuditLog(`auth.${provider}_login_success`, { actorUserId: account.id });
    return {
      sessionToken,
      user: {
        id: account.id,
        email: account.email,
        status: 'active',
        profile: { displayName: profile.displayName, locale: 'ar' }
      }
    };
  }
}
