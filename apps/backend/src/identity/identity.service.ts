import { randomUUID } from 'node:crypto';
import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { getRequestContext } from '../context/request-context';
import { LoginRequest, RegisterRequest, UpdateProfileRequest } from './dto/auth.dto';
import { IdentityRepository } from './identity.repository';
import { PublicUserProfile, UserAccount, UserProfile } from './identity.types';
import { SafeAuthenticationError } from './identity.errors';
import { hashPassword, verifyPassword } from './security/password-security';
import { SessionTokenService } from './security/session-token.service';
import { validateLoginRequest, validateRegisterRequest, validateUpdateProfileRequest } from './identity.validation';

export interface AuthResult {
  readonly sessionToken: string;
  readonly user: PublicUserProfile;
}

@Injectable()
export class IdentityService {
  constructor(
    @Inject(IdentityRepository) private readonly repository: IdentityRepository,
    @Inject(SessionTokenService) private readonly sessionTokens: SessionTokenService
  ) {}

  async register(request: RegisterRequest): Promise<AuthResult> {
    const input = validateRegisterRequest(request);
    if (await this.repository.findAccountByEmail(input.email)) {
      throw new ConflictException('Account already exists.');
    }

    const now = new Date().toISOString();
    const userId = randomUUID();
    const account: UserAccount = {
      id: userId,
      email: input.email,
      passwordHash: hashPassword(input.password),
      status: 'pending',
      createdAt: now,
      updatedAt: now
    };
    const profile: UserProfile = {
      userId,
      displayName: input.displayName,
      locale: 'ar',
      createdAt: now,
      updatedAt: now
    };

    await this.repository.saveAccount(account);
    await this.repository.saveProfile(profile);
    await this.audit('auth.register', userId);

    // A token is returned internally so existing service callers remain compatible,
    // but the HTTP registration controller deliberately does not set it as a cookie
    // until the email address has been verified.
    return this.createSession(account, profile);
  }

  async login(request: LoginRequest): Promise<AuthResult> {
    const input = validateLoginRequest(request);
    const account = await this.repository.findAccountByEmail(input.email);

    if (!account || account.status !== 'active' || !verifyPassword(input.password, account.passwordHash)) {
      await this.audit('auth.login_failed');
      throw new SafeAuthenticationError();
    }

    const profile = await this.repository.findProfile(account.id);
    if (!profile) {
      throw new UnauthorizedException('Session could not be established.');
    }

    await this.audit('auth.login_success', account.id);
    return this.createSession(account, profile);
  }

  async logout(sessionToken: string | undefined): Promise<void> {
    const session = await this.findSession(sessionToken);
    if (session) {
      await this.repository.revokeSession(session.id);
      await this.audit('auth.logout', session.userId);
    }
  }

  async getSession(sessionToken: string | undefined): Promise<PublicUserProfile | undefined> {
    const session = await this.findSession(sessionToken);
    if (!session) {
      return undefined;
    }

    const account = await this.repository.findAccountById(session.userId);
    const profile = await this.repository.findProfile(session.userId);
    if (!account || !profile || account.status !== 'active') {
      return undefined;
    }

    return this.toPublicProfile(account, profile);
  }

  async getCurrentUser(sessionToken: string | undefined): Promise<PublicUserProfile> {
    const user = await this.getSession(sessionToken);
    if (!user) {
      throw new UnauthorizedException('Authentication required.');
    }

    return user;
  }

  async updateProfile(sessionToken: string | undefined, request: UpdateProfileRequest): Promise<PublicUserProfile> {
    const currentUser = await this.getCurrentUser(sessionToken);
    const input = validateUpdateProfileRequest(request);
    const account = await this.repository.findAccountById(currentUser.id);
    const existingProfile = await this.repository.findProfile(currentUser.id);
    if (!account || !existingProfile) {
      throw new UnauthorizedException('Authentication required.');
    }

    const now = new Date().toISOString();
    const profile: UserProfile = {
      ...existingProfile,
      displayName: input.displayName,
      updatedAt: now
    };

    await this.repository.saveProfile(profile);
    await this.audit('profile.update', account.id);

    return this.toPublicProfile(account, profile);
  }

  private async createSession(account: UserAccount, profile: UserProfile): Promise<AuthResult> {
    const sessionToken = this.sessionTokens.createToken();
    await this.repository.saveSession({
      id: randomUUID(),
      userId: account.id,
      tokenHash: this.sessionTokens.hashToken(sessionToken),
      expiresAt: this.sessionTokens.expiresAt(),
      createdAt: new Date().toISOString()
    });

    return {
      sessionToken,
      user: this.toPublicProfile(account, profile)
    };
  }

  private async findSession(sessionToken: string | undefined) {
    if (!sessionToken) {
      return undefined;
    }

    return this.repository.findActiveSessionByTokenHash(this.sessionTokens.hashToken(sessionToken));
  }

  private toPublicProfile(account: UserAccount, profile: UserProfile): PublicUserProfile {
    return {
      id: account.id,
      email: account.email,
      status: account.status,
      profile: {
        displayName: profile.displayName,
        locale: profile.locale
      }
    };
  }

  private async audit(eventType: Parameters<IdentityRepository['appendAuditLog']>[0], actorUserId?: string): Promise<void> {
    const requestContext = getRequestContext();
    await this.repository.appendAuditLog(eventType, {
      actorUserId,
      requestId: requestContext?.requestId,
      correlationId: requestContext?.correlationId
    });
  }
}
