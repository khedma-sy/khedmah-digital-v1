import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { hashPassword } from '../security/password-security';
import { IdentityRepository } from '../identity.repository';
import { SessionTokenService } from '../security/session-token.service';
import { UserAccount, UserProfile } from '../identity.types';

export interface BootstrapAdminRequest {
  readonly email?: unknown;
  readonly password?: unknown;
  readonly displayName?: unknown;
}

export interface BootstrapAdminResult {
  readonly userId: string;
  readonly email: string;
  readonly message: string;
}

const BOOTSTRAP_ROLE = 'bootstrap_admin';

function validateBootstrapRequest(req: BootstrapAdminRequest): { email: string; password: string; displayName: string } {
  if (typeof req.email !== 'string' || !req.email.includes('@') || req.email.length > 254) {
    throw new ForbiddenException('Bootstrap request invalid.');
  }
  if (typeof req.password !== 'string' || req.password.length < 12 || req.password.length > 128) {
    throw new ForbiddenException('Bootstrap request invalid.');
  }
  if (typeof req.displayName !== 'string' || req.displayName.trim().length < 2 || req.displayName.trim().length > 80) {
    throw new ForbiddenException('Bootstrap request invalid.');
  }
  return {
    email: req.email.trim().toLowerCase(),
    password: req.password,
    displayName: req.displayName.trim()
  };
}

function secretMatches(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const providedDigest = createHash('sha256').update(provided).digest();
  const expectedDigest = createHash('sha256').update(expected).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

@Injectable()
export class BootstrapAdminService {
  constructor(
    @Inject(IdentityRepository) private readonly repository: IdentityRepository,
    @Inject(SessionTokenService) private readonly sessionTokens: SessionTokenService
  ) {}

  /**
   * One-time bootstrap: creates the first admin account if and only if
   * BOOTSTRAP_ADMIN_SECRET matches and no admin account exists yet.
   * The repository serializes creation across backend replicas.
   * After first execution the secret env var should be removed.
   */
  async bootstrap(providedSecret: string | undefined, request: BootstrapAdminRequest): Promise<BootstrapAdminResult> {
    const expectedSecret = process.env.BOOTSTRAP_ADMIN_SECRET;

    if (!expectedSecret || expectedSecret.length < 32) {
      throw new ForbiddenException('Bootstrap is not available.');
    }

    if (!secretMatches(providedSecret, expectedSecret)) {
      throw new ForbiddenException('Bootstrap secret invalid.');
    }

    // Fast path. createBootstrapAdmin repeats this decision while holding the
    // database-wide advisory lock, so concurrent requests cannot both win.
    if (await this.repository.hasAdminAccount()) {
      throw new ConflictException('Bootstrap has already been completed. Remove BOOTSTRAP_ADMIN_SECRET from environment.');
    }

    const input = validateBootstrapRequest(request);
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

    const created = await this.repository.createBootstrapAdmin(account, profile, BOOTSTRAP_ROLE);
    if (!created) {
      throw new ConflictException('Bootstrap has already been completed. Remove BOOTSTRAP_ADMIN_SECRET from environment.');
    }

    return {
      userId,
      email: input.email,
      message: 'Bootstrap admin created. Remove BOOTSTRAP_ADMIN_SECRET from environment immediately.'
    };
  }

  async isBootstrapAvailable(): Promise<boolean> {
    const secret = process.env.BOOTSTRAP_ADMIN_SECRET;
    if (!secret || secret.length < 32) return false;
    return !(await this.repository.hasAdminAccount());
  }
}
