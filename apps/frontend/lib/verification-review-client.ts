const API_BASE = '';

export type VerificationDecision = 'approved' | 'rejected';

export interface VerificationReviewItem {
  readonly requestId: string;
  readonly entityType: 'business' | 'professional';
  readonly entityId: string;
  readonly label: string;
  readonly profileRevision: string;
  readonly createdAt: string;
}

export interface VerificationReviewResult extends VerificationReviewItem {
  readonly status: VerificationDecision;
  readonly reviewedAt: string;
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
    throw Object.assign(new Error(text), { statusCode: response.status });
  }
  return data as T;
}

export const verificationReviewApi = {
  pending() {
    return request<{ requests: VerificationReviewItem[] }>('/admin/moderation/verification/pending');
  },
  decide(requestId: string, decision: VerificationDecision, expectedRevision: string, notes: string) {
    const action = decision === 'approved' ? 'approve' : 'reject';
    return request<{ request: VerificationReviewResult }>(
      `/admin/moderation/verification/${encodeURIComponent(requestId)}/${action}`,
      { method: 'POST', body: JSON.stringify({ expectedRevision, notes }) }
    );
  }
};
