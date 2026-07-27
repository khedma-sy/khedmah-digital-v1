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

  register(request: RegisterRequest): AuthResult {
    const input = validateRegisterRequest(request);
    if (this.repository.findAccountByEmail(input.email)) {
      throw new ConflictException('Account already exists.');
    }

    const now = new Date().toISOString();
    const userId = randomUUID();
    const account: UserAccount = {
      id: userId,
      email: input.email,
      passwordHash: hashPassword(input.password),
      status: 'active',
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

    this.repository.saveAccount(account);
    this.repository.saveProfile(profile);
    this.audit('auth.register', userId);

    return this.createSession(account, profile);
  }

  login(request: LoginRequest): AuthResult {
    const input = validateLoginRequest(request);
    const account = this.repository.findAccountByEmail(input.email);

    if (!account || account.status !== 'active' || !verifyPassword(input.password, account.passwordHash)) {
      this.audit('auth.login_failed');
      throw new SafeAuthenticationError();
    }

    const profile = this.repository.findProfile(account.id);
    if (!profile) {
      throw new UnauthorizedException('Session could not be established.');
    }

    this.audit('auth.login_success', account.id);
    return this.createSession(account, profile);
  }

  logout(sessionToken: string | undefined): void {
    const session = this.findSession(sessionToken);
    if (session) {
      this.repository.revokeSession(session.id);
      this.audit('auth.logout', session.userId);
    }
  }

  getSession(sessionToken: string | undefined): PublicUserProfile | undefined {
    const session = this.findSession(sessionToken);
    if (!session) {
      return undefined;
    }

    const account = this.repository.findAccountById(session.userId);
    const profile = this.repository.findProfile(session.userId);
    if (!account || !profile || account.status !== 'active') {
      return undefined;
    }

    return this.toPublicProfile(account, profile);
  }

  getCurrentUser(sessionToken: string | undefined): PublicUserProfile {
    const user = this.getSession(sessionToken);
    if (!user) {
      throw new UnauthorizedException('Authentication required.');
    }

    return user;
  }

  updateProfile(sessionToken: string | undefined, request: UpdateProfileRequest): PublicUserProfile {
    const currentUser = this.getCurrentUser(sessionToken);
    const input = validateUpdateProfileRequest(request);
    const account = this.repository.findAccountById(currentUser.id);
    const existingProfile = this.repository.findProfile(currentUser.id);
    if (!account || !existingProfile) {
      throw new UnauthorizedException('Authentication required.');
    }

    const now = new Date().toISOString();
    const profile: UserProfile = {
      ...existingProfile,
      displayName: input.displayName,
      updatedAt: now
    };

    this.repository.saveProfile(profile);
    this.audit('profile.update', account.id);

    return this.toPublicProfile(account, profile);
  }

  private createSession(account: UserAccount, profile: UserProfile): AuthResult {
    const sessionToken = this.sessionTokens.createToken();
    this.repository.saveSession({
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

  private findSession(sessionToken: string | undefined) {
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

  private audit(eventType: Parameters<IdentityRepository['appendAuditLog']>[0], actorUserId?: string): void {
    const requestContext = getRequestContext();
    this.repository.appendAuditLog(eventType, {
      actorUserId,
      requestId: requestContext?.requestId,
      correlationId: requestContext?.correlationId
    });
  }
}
