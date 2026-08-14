export type BusinessProfileVisibility = 'public' | 'private';
export type BusinessProfileTrustStatus = 'approved' | 'suspended' | 'pending_review';
export type ContactInquiryStatus = 'submitted';
export type ContactActionType = 'contact_click';

export interface ContactBusinessProfileSnapshot {
  readonly id: string;
  readonly visibility: BusinessProfileVisibility;
  readonly trustStatus: BusinessProfileTrustStatus;
  readonly ownerUserId: string;
}

export interface ContactInquiry {
  readonly id: string;
  readonly businessProfileId?: string;
  readonly professionalProfileId?: string;
  readonly submitterUserId: string;
  readonly name: string;
  readonly contactEmail: string;
  readonly message: string;
  readonly status: ContactInquiryStatus;
  readonly trackingStatus: ContactInquiryStatus;
  readonly createdAt: string;
  readonly requestId?: string;
  readonly correlationId?: string;
}

export interface PublicContactInquiryReceipt {
  readonly id: string;
  readonly targetType: 'business' | 'professional';
  readonly businessProfileId?: string;
  readonly professionalProfileId?: string;
  readonly status: ContactInquiryStatus;
  readonly trackingStatus: ContactInquiryStatus;
  readonly createdAt: string;
}

export interface ProviderContactInquiry {
  readonly id: string;
  readonly businessProfileId?: string;
  readonly professionalProfileId?: string;
  readonly name: string;
  readonly contactEmail: string;
  readonly message: string;
  readonly status: ContactInquiryStatus;
  readonly createdAt: string;
}

export interface ContactActionEvent {
  readonly id: string;
  readonly businessProfileId: string;
  readonly actorUserId?: string;
  readonly actionType: ContactActionType;
  readonly createdAt: string;
  readonly requestId?: string;
  readonly correlationId?: string;
}

export interface PublicContactActionReceipt {
  readonly id: string;
  readonly businessProfileId: string;
  readonly actionType: ContactActionType;
  readonly trackedAt: string;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly key: string;
  readonly remaining: number;
}
