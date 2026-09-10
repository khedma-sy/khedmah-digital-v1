const API_BASE = '';

export type AdKind = 'sale' | 'service' | 'wanted' | 'rent';
export type AdPriceMode = 'fixed' | 'negotiable' | 'contact' | 'none';
export type AdContactMode = 'profile' | 'phone' | 'whatsapp';
export type AdStatus = 'draft' | 'pending_review' | 'active' | 'inactive' | 'expired' | 'rejected';

export interface AdListingBase {
  readonly id: string;
  readonly businessProfileId?: string;
  readonly kind: AdKind;
  readonly titleAr: string;
  readonly descriptionAr?: string;
  readonly categoryCode: string;
  readonly priceMode: AdPriceMode;
  readonly priceMinor?: number;
  readonly currency?: 'SYP' | 'USD';
  readonly cityCode?: string;
  readonly areaText?: string;
  readonly contactMode: AdContactMode;
  readonly contactValue?: string;
  readonly status: AdStatus;
  readonly imageUrls: readonly string[];
  readonly expiresAt?: string;
  readonly submittedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PublicAdListing extends AdListingBase {}

export interface OwnerAdListing extends AdListingBase {
  readonly rejectionReason?: string;
  readonly revision: number;
  readonly contentRevision: number;
  readonly reviewRevision: number;
}

export interface AdImage {
  readonly id: string;
  readonly adId: string;
  readonly filename: string;
  readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  readonly sizeBytes: number;
  readonly publicUrl: string;
  readonly sortOrder: number;
  readonly createdAt: string;
}

export interface AdQuota { readonly used: number; readonly limit: 3 }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}/api/v1${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers }
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

export const classifiedsApi = {
  list(filters: { q?: string; categoryCode?: string; cityCode?: string } = {}) {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.categoryCode) params.set('categoryCode', filters.categoryCode);
    if (filters.cityCode) params.set('cityCode', filters.cityCode);
    return request<{ ads: PublicAdListing[] }>(`/classifieds${params.size ? `?${params}` : ''}`);
  },
  get(id: string) { return request<{ ad: PublicAdListing }>(`/classifieds/${encodeURIComponent(id)}`); },
  listMine() { return request<{ ads: OwnerAdListing[] }>('/classifieds/mine'); },
  getMine(id: string) { return request<{ ad: OwnerAdListing }>(`/classifieds/mine/${encodeURIComponent(id)}`); },
  quota() { return request<AdQuota>('/classifieds/quota'); },
  create(data: Record<string, unknown>) { return request<{ ad: OwnerAdListing }>('/classifieds', { method: 'POST', body: JSON.stringify(data) }); },
  update(id: string, data: Record<string, unknown>) { return request<{ ad: OwnerAdListing }>(`/classifieds/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }); },
  submit(id: string, clientRequestId: string) { return request<{ ad: OwnerAdListing }>(`/classifieds/${encodeURIComponent(id)}/submit`, { method: 'POST', body: JSON.stringify({ clientRequestId }) }); },
  deactivate(id: string, data: { clientRequestId: string; expectedRevision: number }) { return request<{ ad: OwnerAdListing }>(`/classifieds/${encodeURIComponent(id)}/deactivate`, { method: 'POST', body: JSON.stringify(data) }); },
  reactivate(id: string, data: { clientRequestId: string; expectedRevision: number }) { return request<{ ad: OwnerAdListing }>(`/classifieds/${encodeURIComponent(id)}/reactivate`, { method: 'POST', body: JSON.stringify(data) }); },
  uploadImage(id: string, data: { clientRequestId: string; expectedContentRevision: number; filename: string; mimeType: AdImage['mimeType']; sizeBytes: number; content: string; sortOrder?: number }) {
    return request<{ adRevision: number; contentRevision: number; image: AdImage }>(`/classifieds/${encodeURIComponent(id)}/media`, { method: 'POST', body: JSON.stringify(data) });
  },
  listImages(id: string) { return request<{ images: AdImage[] }>(`/classifieds/${encodeURIComponent(id)}/media`); },
  deleteImage(id: string, mediaId: string, data: { clientRequestId: string; expectedContentRevision: number }) {
    return request<{ deleted: true; adRevision: number; contentRevision: number }>(`/classifieds/${encodeURIComponent(id)}/media/${encodeURIComponent(mediaId)}`, { method: 'DELETE', body: JSON.stringify(data) });
  }
};
