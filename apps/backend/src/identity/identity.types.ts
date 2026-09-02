export type AccountStatus = 'created' | 'pending' | 'active' | 'suspended' | 'archived';

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

export type AuditEventType =
  | 'auth.register'
  | 'auth.login_success'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'auth.password_reset_requested'
  | 'auth.password_reset_completed'
  | 'auth.google_login_success'
  | 'auth.google_login_failed'
  | 'auth.facebook_login_success'
  | 'auth.facebook_login_failed'
  | 'profile.update'
  | 'organization.create'
  | 'organization.update'
  | 'organization.member.add'
  | 'organization.member.update'
  | 'organization.member.remove'
  | 'contact.inquiry.submitted'
  | 'contact.inquiry.rate_limited'
  | 'contact.inquiry.abuse_blocked'
  | 'contact.click.tracked'
  | 'contact.click.rate_limited'
  | 'provider.report.submitted'
  | 'provider.report.reviewed'
  | 'analytics.event.recorded'
  | 'operations.change.requested'
  | 'operations.rollback.requested'
  | 'operations.incident.created'
  | 'business_profile.create'
  | 'business_profile.update'
  | 'business_profile.trust_status.update'
  | 'professional_profile.create'
  | 'professional_profile.update'
  | 'service.create'
  | 'service.update'
  | 'service.delete'
  | 'product.auto_approved'
  | 'product.auto_review_required'
  | 'mobility.request.created'
  | 'mobility.request.status_changed'
  | 'fulfillment.order.created'
  | 'fulfillment.order.status_changed'
  | 'professional_request.created'
  | 'professional_offer.accepted'
  | 'admin.bootstrap'
  | 'email.verification.requested'
  | 'email.verification.confirmed'
  | 'email.verification.expired';

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
