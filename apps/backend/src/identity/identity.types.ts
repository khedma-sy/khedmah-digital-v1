export type AccountStatus = 'active' | 'disabled';

export interface UserAccount {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly status: AccountStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface UserProfile {
  readonly userId: string;
  readonly displayName: string;
  readonly locale: 'ar';
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface UserSession {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: string;
  readonly createdAt: string;
  revokedAt?: string;
}

export type AuditEventType = 'auth.register' | 'auth.login_success' | 'auth.login_failed' | 'auth.logout' | 'profile.update';

export interface AuditLog {
  readonly id: string;
  readonly actorUserId?: string;
  readonly eventType: AuditEventType;
  readonly occurredAt: string;
  readonly requestId?: string;
  readonly correlationId?: string;
}

export interface PublicUserProfile {
  readonly id: string;
  readonly email: string;
  readonly status: AccountStatus;
  readonly profile: {
    readonly displayName: string;
    readonly locale: 'ar';
  };
}
