const API_BASE = '';

export type TaxiDocumentType = 'driver_photo' | 'identity_card' | 'driving_license' | 'vehicle_license';
export type TaxiDocumentStatus = 'missing' | 'pending' | 'approved' | 'rejected';
export type TaxiOperationalStatus = 'approved' | 'suspended' | 'revoked';

export interface TaxiOperationalCandidate {
  readonly businessProfileId: string;
  readonly name: string;
  readonly ownerUserId: string;
  readonly cityCode: string;
  readonly profileReady: boolean;
  readonly visibility: string;
  readonly moderationStatus: string;
  readonly trustStatus: string;
  readonly businessStatus: string;
  readonly documents: Readonly<Record<TaxiDocumentType, TaxiDocumentStatus>>;
  readonly documentsApproved: boolean;
  readonly operationalStatus?: TaxiOperationalStatus;
  readonly zoneCode?: string;
  readonly expiresAt?: string;
  readonly driverRevision?: string;
  readonly vehicleRevision?: string;
}

export interface TaxiDriverDocument {
  readonly id: string;
  readonly businessProfileId: string;
  readonly documentType: TaxiDocumentType;
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly reviewStatus: Exclude<TaxiDocumentStatus, 'missing'>;
  readonly reviewReason?: string;
  readonly reviewedAt?: string;
  readonly createdAt: string;
  readonly secureUrl: string;
}

export interface TaxiOperationalDecisionInput {
  readonly verificationReference: string;
  readonly reason: string;
  readonly zoneCode?: string;
  readonly expiresAt?: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}/api/v1${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (data as { message?: string | string[] }).message ?? `خطأ في الخادم (${response.status})`;
    const text = Array.isArray(message) ? message.join('. ') : message;
    throw Object.assign(new Error(text), {
      statusCode: response.status,
      code: (data as { code?: string }).code
    });
  }
  return data as T;
}

export const taxiOperationalReviewApi = {
  candidates() {
    return request<TaxiOperationalCandidate[]>('/taxi-operational-approvals/candidates');
  },
  status(businessProfileId: string) {
    return request<TaxiOperationalCandidate>(`/taxi-operational-approvals/${encodeURIComponent(businessProfileId)}`);
  },
  documents(businessProfileId: string) {
    return request<{ documents: TaxiDriverDocument[] }>(`/driver-documents/business/${encodeURIComponent(businessProfileId)}`);
  },
  reviewDocument(documentId: string, status: 'approved' | 'rejected', reason?: string) {
    return request<{ review: { id: string; status: 'approved' | 'rejected'; reason?: string; reviewedAt: string } }>(
      `/driver-documents/${encodeURIComponent(documentId)}/review`,
      { method: 'POST', body: JSON.stringify({ status, reason }) }
    );
  },
  approve(businessProfileId: string, input: Required<TaxiOperationalDecisionInput>) {
    return request<{ businessProfileId: string; driverUserId: string; vehicleId: string; zoneCode: string; status: 'approved'; expiresAt: string; driverRevision: string; vehicleRevision: string }>(
      `/taxi-operational-approvals/${encodeURIComponent(businessProfileId)}/approve`,
      { method: 'POST', body: JSON.stringify(input) }
    );
  },
  restrict(businessProfileId: string, decision: 'suspend' | 'revoke', input: Pick<TaxiOperationalDecisionInput, 'verificationReference' | 'reason'>) {
    return request<{ businessProfileId: string; status: 'suspended' | 'revoked'; driverRevision: string; vehicleRevision: string }>(
      `/taxi-operational-approvals/${encodeURIComponent(businessProfileId)}/${decision}`,
      { method: 'POST', body: JSON.stringify(input) }
    );
  }
};
