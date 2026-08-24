import { randomBytes, randomUUID } from 'node:crypto';
import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { DatabasePool } from '../../database/database.pool';
import { IdentityRepository } from '../identity.repository';
import type { PublicUserProfile, UserAccount, UserProfile } from '../identity.types';
import { hashPassword } from '../security/password-security';
import { SessionTokenService } from '../security/session-token.service';
import { FirebaseAuthService } from './firebase-auth.service';

export interface GoogleAuthResult {
  readonly sessionToken: string;
  readonly user: PublicUserProfile;
}

@Injectable()
export class GoogleLoginService {
  constructor(
    @Inject(DatabasePool) private readonly db: DatabasePool,
    @Inject(IdentityRepository) private readonly repository: IdentityRepository,
    @Inject(SessionTokenService) private readonly sessionTokens: SessionTokenService,
    @Inject(FirebaseAuthService) private readonly firebase: FirebaseAuthService
  ) {}

  async login(idToken: unknown): Promise<GoogleAuthResult> {
    let identity: { subject: string; email: string; displayName: string };
    try {
      identity = await this.firebase.verifyGoogleIdToken(idToken);
    } catch (error) {
      await this.repository.appendAuditLog('auth.google_login_failed');
      throw error;
    }

    const providerRows = await this.db.query<{ user_id: string; email: string }>(
      `SELECT user_id, email FROM oauth_identities WHERE provider = 'google' AND provider_subject = $1 LIMIT 1`,
      [identity.subject]
    );
    const providerLink = providerRows[0];
    let account = providerLink
      ? await this.repository.findAccountById(providerLink.user_id)
      : await this.repository.findAccountByEmail(identity.email);

    if (providerLink && providerLink.email.toLowerCase() !== identity.email) {
      await this.repository.appendAuditLog('auth.google_login_failed', { actorUserId: providerLink.user_id });
      throw new UnauthorizedException('Google identity does not match the linked account.');
    }
    if (account && (account.status === 'suspended' || account.status === 'archived')) {
      await this.repository.appendAuditLog('auth.google_login_failed', { actorUserId: account.id });
      throw new UnauthorizedException('Account is not eligible for sign in.');
    }

    const now = new Date().toISOString();
    if (!account) {
      account = {
        id: randomUUID(),
        email: identity.email,
        passwordHash: hashPassword(randomBytes(32).toString('base64url')),
        status: 'active',
        createdAt: now,
        updatedAt: now
      } satisfies UserAccount;
      await this.repository.saveAccount(account);
      await this.repository.saveProfile({
        userId: account.id,
        displayName: identity.displayName.length >= 2 ? identity.displayName : 'مستخدم خدمة',
        locale: 'ar',
        createdAt: now,
        updatedAt: now
      });
    } else if (account.status !== 'active') {
      account = { ...account, status: 'active', updatedAt: now };
      await this.repository.saveAccount(account);
    }

    const conflicting = await this.db.query<{ user_id: string }>(
      `SELECT user_id FROM oauth_identities WHERE provider = 'google' AND email = $1 AND user_id <> $2 LIMIT 1`,
      [identity.email, account.id]
    );
    if (conflicting[0]) throw new ConflictException('Google identity is already linked to another account.');

    await this.db.query(
      `INSERT INTO oauth_identities (id, user_id, provider, provider_subject, email, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'google', $2, $3, NOW(), NOW())
       ON CONFLICT (provider, provider_subject) DO UPDATE SET email = EXCLUDED.email, updated_at = NOW()`,
      [account.id, identity.subject, identity.email]
    );

    let profile = await this.repository.findProfile(account.id);
    if (!profile) {
      profile = {
        userId: account.id,
        displayName: identity.displayName.length >= 2 ? identity.displayName : 'مستخدم خدمة',
        locale: 'ar',
        createdAt: now,
        updatedAt: now
      } satisfies UserProfile;
      await this.repository.saveProfile(profile);
    }

    const sessionToken = this.sessionTokens.createToken();
    await this.repository.saveSession({
      id: randomUUID(),
      userId: account.id,
      tokenHash: this.sessionTokens.hashToken(sessionToken),
      expiresAt: this.sessionTokens.expiresAt(),
      createdAt: now
    });
    await this.repository.appendAuditLog('auth.google_login_success', { actorUserId: account.id });

    return {
      sessionToken,
      user: {
        id: account.id,
        email: account.email,
        status: account.status,
        profile: { displayName: profile.displayName, locale: profile.locale }
      }
    };
  }
}
