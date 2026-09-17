export type AiAdminAnalysisMode = 'executive' | 'expose' | 'killcritic' | 'autopsy';

export interface AiAdminStatus {
  readonly enabled: boolean;
  readonly operatingMode: 'supervised';
  readonly monthlyBudgetUsdCents: number;
  readonly updatedByUserId?: string;
  readonly updatedAt: string;
  readonly providerConfigured: boolean;
  readonly executionAvailable: false;
  readonly phase: 'control_plane_only';
  readonly analysisModes: readonly AiAdminAnalysisMode[];
  readonly capabilities: readonly string[];
  readonly approvalRequired: readonly string[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const raw = (data as { message?: string | string[] }).message ?? `خطأ في الخادم (${response.status})`;
    const message = Array.isArray(raw) ? raw.join('. ') : raw;
    throw Object.assign(new Error(message), { statusCode: response.status });
  }
  return data as T;
}

export const aiAdminApi = {
  status() {
    return request<{ aiAdmin: AiAdminStatus }>('/admin/ai-admin/status');
  },
  setEnabled(enabled: boolean) {
    return request<{ aiAdmin: AiAdminStatus }>('/admin/ai-admin/state', {
      method: 'POST',
      body: JSON.stringify({ enabled })
    });
  }
};
