const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface PublicUserProfile {
  readonly id: string;
  readonly email: string;
  readonly status: string;
  readonly profile: {
    readonly displayName: string;
    readonly locale: string;
  };
}

export interface PublicOrganization {
  readonly id: string;
  readonly name: string;
  readonly ownerUserId: string;
  readonly memberCount: number;
}

export interface PublicBusinessProfile {
  readonly id: string;
  readonly name: string;
  readonly descriptionAr?: string;
  readonly descriptionEn?: string;
  readonly visibility: 'public' | 'private';
  readonly trustStatus: 'pending' | 'approved' | 'suspended';
  readonly status: 'active' | 'suspended';
  readonly phone?: string;
  readonly email?: string;
  readonly website?: string;
  readonly categoryCode: string;
  readonly cityCode: string;
  readonly countryCode: string;
  readonly lat?: number;
  readonly lng?: number;
  readonly addressAr?: string;
  readonly isFeatured: boolean;
  readonly createdAt: string;
  readonly serviceRadius?: number;
  readonly availability?: 'available' | 'busy' | 'unavailable';
  readonly rating?: number;
  readonly responseSpeedMinutes?: number;
  readonly distanceKm?: number;
  readonly matchScore?: number;
}

export interface PublicProfessionalProfile {
  readonly id: string;
  readonly headlineAr: string;
  readonly headlineEn?: string;
  readonly bioAr?: string;
  readonly bioEn?: string;
  readonly availability: 'available' | 'busy' | 'unavailable';
  readonly cityCode: string;
  readonly countryCode: string;
  readonly skills: string[];
  readonly isFeatured: boolean;
  readonly createdAt: string;
}

export interface PublicServiceListing {
  readonly id: string;
  readonly ownerType: 'business' | 'professional';
  readonly ownerId: string;
  readonly titleAr: string;
  readonly titleEn?: string;
  readonly descriptionAr?: string;
  readonly descriptionEn?: string;
  readonly categoryCode: string;
  readonly price?: number;
  readonly priceCurrency?: string;
  readonly priceType: 'fixed' | 'hourly' | 'negotiable';
  readonly status: 'active' | 'inactive';
  readonly isFeatured: boolean;
  readonly createdAt: string;
}

export interface MediaAsset {
  readonly id: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly assetType: 'logo' | 'cover' | 'gallery' | 'profile_image' | 'service_image';
  readonly url: string;
  readonly storagePath: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly sortOrder: number;
  readonly createdAt: string;
}

export interface OpeningHours {
  readonly id: string;
  readonly businessProfileId: string;
  readonly dayOfWeek: number;
  readonly openTime: string;
  readonly closeTime: string;
  readonly isClosed: boolean;
}

export interface BusinessBranch {
  readonly id: string;
  readonly businessProfileId: string;
  readonly nameAr: string;
  readonly nameEn?: string;
  readonly addressAr?: string;
  readonly phone?: string;
  readonly cityCode: string;
  readonly lat?: number;
  readonly lng?: number;
  readonly isMain: boolean;
}

export interface BusinessSocialLink {
  readonly id: string;
  readonly businessProfileId: string;
  readonly platform: string;
  readonly url: string;
}

export interface VerificationRequest {
  readonly id: string;
  readonly entityType: 'business' | 'professional';
  readonly entityId: string;
  readonly requesterId: string;
  readonly status: 'pending' | 'approved' | 'rejected';
  readonly notes?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TrustHistoryEntry {
  readonly id: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly oldStatus?: string;
  readonly newStatus: string;
  readonly changedBy?: string;
  readonly reason?: string;
  readonly createdAt: string;
}

export interface City {
  readonly code: string;
  readonly nameAr: string;
  readonly nameEn: string;
  readonly countryCode: string;
}

export interface Country {
  readonly code: string;
  readonly nameAr: string;
  readonly nameEn: string;
}

export interface SearchResults {
  readonly businesses: PublicBusinessProfile[];
  readonly professionals: PublicProfessionalProfile[];
  readonly services: PublicServiceListing[];
  readonly total: number;
}

export interface ApiError {
  readonly message: string;
  readonly statusCode: number;
}

export interface ContactInquiryReceipt {
  readonly id: string;
  readonly businessProfileId: string;
  readonly status: 'submitted';
  readonly createdAt: string;
}

export interface ProviderContactInquiry {
  readonly id: string;
  readonly businessProfileId: string;
  readonly name: string;
  readonly contactEmail: string;
  readonly message: string;
  readonly status: 'submitted';
  readonly createdAt: string;
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
    const message =
      (data as { message?: string | string[] }).message ??
      `خطأ في الخادم (${response.status})`;
    const text = Array.isArray(message) ? message.join('. ') : (message as string);
    throw Object.assign(new Error(text), { statusCode: response.status });
  }

  return data as T;
}

export const api = {
  auth: {
    register(email: string, password: string, displayName: string) {
      return request<{ user: PublicUserProfile }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, displayName })
      });
    },
    login(email: string, password: string) {
      return request<{ user: PublicUserProfile }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
    },
    logout() {
      return request<{ status: string }>('/auth/logout', { method: 'POST' });
    },
    session() {
      return request<{ user: PublicUserProfile }>('/auth/session');
    }
  },
  organizations: {
    create(name: string) {
      return request<{ organization: PublicOrganization }>('/organizations', {
        method: 'POST',
        body: JSON.stringify({ name })
      });
    },
    listMine() {
      return request<{ organizations: PublicOrganization[] }>('/organizations/my');
    }
  },
  businesses: {
    create(data: {
      name: string;
      descriptionAr?: string;
      descriptionEn?: string;
      phone?: string;
      email?: string;
      website?: string;
      categoryCode: string;
      cityCode: string;
      countryCode: string;
    }) {
      return request<{ business: PublicBusinessProfile }>('/businesses', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    listMine() {
      return request<{ businesses: PublicBusinessProfile[] }>('/businesses/my');
    },
    getPublic(id: string) {
      return request<{ business: PublicBusinessProfile }>(`/businesses/${id}`);
    },
    getFeatured() {
      return request<{ businesses: PublicBusinessProfile[] }>('/businesses/featured');
    },
    getRecentlyAdded() {
      return request<{ businesses: PublicBusinessProfile[] }>('/businesses/recently-added');
    },
    search(params: { q?: string; categoryCode?: string; cityCode?: string; page?: number }) {
      const qs = new URLSearchParams();
      if (params.q) qs.set('q', params.q);
      if (params.categoryCode) qs.set('categoryCode', params.categoryCode);
      if (params.cityCode) qs.set('cityCode', params.cityCode);
      if (params.page) qs.set('page', String(params.page));
      return request<{ businesses: PublicBusinessProfile[]; total: number }>(`/businesses/search?${qs}`);
    },
    update(id: string, data: Partial<{
      name: string;
      descriptionAr: string;
      descriptionEn: string;
      phone: string;
      email: string;
      website: string;
      visibility: string;
      categoryCode: string;
      cityCode: string;
      countryCode: string;
      lat: number;
      lng: number;
      addressAr: string;
    }>) {
      return request<{ business: PublicBusinessProfile }>(`/businesses/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data)
      });
    },
    updateTrustStatus(id: string, trustStatus: string) {
      return request<{ business: PublicBusinessProfile }>(`/businesses/${id}/trust-status`, {
        method: 'PATCH',
        body: JSON.stringify({ trustStatus })
      });
    },
    // Media
    addMedia(id: string, data: { assetType: string; url: string; storagePath: string; mimeType: string; sizeBytes?: number; sortOrder?: number }) {
      return request<{ asset: MediaAsset }>(`/businesses/${id}/media`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    getMedia(id: string, assetType?: string) {
      const qs = assetType ? `?assetType=${assetType}` : '';
      return request<{ assets: MediaAsset[] }>(`/businesses/${id}/media${qs}`);
    },
    deleteMedia(id: string, assetId: string) {
      return request<{ status: string }>(`/businesses/${id}/media/${assetId}`, { method: 'DELETE' });
    },
    // Opening hours
    setOpeningHours(id: string, hours: Array<{ dayOfWeek: number; openTime: string; closeTime: string; isClosed?: boolean }>) {
      return request<{ hours: OpeningHours[] }>(`/businesses/${id}/opening-hours`, {
        method: 'POST',
        body: JSON.stringify({ hours })
      });
    },
    getOpeningHours(id: string) {
      return request<{ hours: OpeningHours[] }>(`/businesses/${id}/opening-hours`);
    },
    // Branches
    addBranch(id: string, data: { nameAr: string; nameEn?: string; addressAr?: string; phone?: string; cityCode: string; lat?: number; lng?: number; isMain?: boolean }) {
      return request<{ branch: BusinessBranch }>(`/businesses/${id}/branches`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    getBranches(id: string) {
      return request<{ branches: BusinessBranch[] }>(`/businesses/${id}/branches`);
    },
    // Social links
    setSocialLink(id: string, platform: string, url: string) {
      return request<{ link: BusinessSocialLink }>(`/businesses/${id}/social-links`, {
        method: 'POST',
        body: JSON.stringify({ platform, url })
      });
    },
    getSocialLinks(id: string) {
      return request<{ links: BusinessSocialLink[] }>(`/businesses/${id}/social-links`);
    },
    deleteSocialLink(id: string, linkId: string) {
      return request<{ status: string }>(`/businesses/${id}/social-links/${linkId}`, { method: 'DELETE' });
    },
    // Verification
    requestVerification(id: string) {
      return request<{ request: VerificationRequest }>(`/businesses/${id}/verification-request`, { method: 'POST' });
    },
    getVerificationStatus(id: string) {
      return request<{ status: VerificationRequest | null }>(`/businesses/${id}/verification-status`);
    },
    getTrustHistory(id: string) {
      return request<{ history: TrustHistoryEntry[] }>(`/businesses/${id}/trust-history`);
    },
    submitInquiry(id: string, data: { name: string; contactEmail: string; message: string }) {
      return request<{ inquiry: ContactInquiryReceipt }>(`/businesses/${id}/inquiries`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    listReceivedInquiries(id: string) {
      return request<{ inquiries: ProviderContactInquiry[] }>(`/businesses/${id}/inquiries`);
    }
  },
  professionals: {
    createOrUpdate(data: {
      headlineAr: string;
      headlineEn?: string;
      bioAr?: string;
      bioEn?: string;
      availability?: string;
      cityCode: string;
      countryCode: string;
      skills?: string[];
    }) {
      return request<{ professional: PublicProfessionalProfile }>('/professionals', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    getMine() {
      return request<{ professional: PublicProfessionalProfile | null }>('/professionals/me');
    },
    getProfile(id: string) {
      return request<{ professional: PublicProfessionalProfile }>(`/professionals/${id}`);
    },
    getFeatured() {
      return request<{ professionals: PublicProfessionalProfile[] }>('/professionals/featured');
    },
    search(params: { q?: string; cityCode?: string; availability?: string; page?: number }) {
      const qs = new URLSearchParams();
      if (params.q) qs.set('q', params.q);
      if (params.cityCode) qs.set('cityCode', params.cityCode);
      if (params.availability) qs.set('availability', params.availability);
      if (params.page) qs.set('page', String(params.page));
      return request<{ professionals: PublicProfessionalProfile[]; page: number }>(`/professionals/search?${qs}`);
    },
    // Media
    addMedia(id: string, data: { assetType: string; url: string; storagePath: string; mimeType: string; sizeBytes?: number }) {
      return request<{ asset: MediaAsset }>(`/professionals/${id}/media`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    getMedia(id: string, assetType?: string) {
      const qs = assetType ? `?assetType=${assetType}` : '';
      return request<{ assets: MediaAsset[] }>(`/professionals/${id}/media${qs}`);
    },
    // Verification
    requestVerification(id: string) {
      return request<{ request: VerificationRequest }>(`/professionals/${id}/verification-request`, { method: 'POST' });
    },
    getVerificationStatus(id: string) {
      return request<{ status: VerificationRequest | null }>(`/professionals/${id}/verification-status`);
    },
    getTrustHistory(id: string) {
      return request<{ history: TrustHistoryEntry[] }>(`/professionals/${id}/trust-history`);
    }
  },
  services: {
    create(data: {
      titleAr: string;
      titleEn?: string;
      descriptionAr?: string;
      descriptionEn?: string;
      categoryCode: string;
      price?: number;
      priceCurrency?: string;
      priceType?: string;
      ownerId: string;
      ownerType: string;
      ownerUserId: string;
    }) {
      return request<{ service: PublicServiceListing }>('/services', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    listForOwner(ownerId: string, ownerType: string) {
      return request<{ services: PublicServiceListing[] }>(`/services/owner/${ownerId}?ownerType=${ownerType}`);
    },
    update(id: string, data: Partial<{ titleAr: string; descriptionAr: string; categoryCode: string; price: number; priceCurrency: string; priceType: string; status: string }>) {
      return request<{ service: PublicServiceListing }>(`/services/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data)
      });
    },
    getFeatured() {
      return request<{ services: PublicServiceListing[] }>('/services/featured');
    },
    addMedia(id: string, data: { url: string; storagePath: string; mimeType: string; sizeBytes?: number }) {
      return request<{ asset: MediaAsset }>(`/services/${id}/media`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    getMedia(id: string) {
      return request<{ assets: MediaAsset[] }>(`/services/${id}/media`);
    },
    search(params: { q?: string; categoryCode?: string; page?: number }) {
      const qs = new URLSearchParams();
      if (params.q) qs.set('q', params.q);
      if (params.categoryCode) qs.set('categoryCode', params.categoryCode);
      if (params.page) qs.set('page', String(params.page));
      return request<{ services: PublicServiceListing[]; total: number }>(`/services/search?${qs}`);
    }
  },
  locations: {
    cities() {
      return request<{ cities: City[] }>('/locations/cities');
    },
    countries() {
      return request<{ countries: Country[] }>('/locations/countries');
    }
  },
  search: {
    query(params: { q?: string; categoryCode?: string; cityCode?: string; page?: number; type?: string; map?: boolean; boundaries?: { south: number; west: number; north: number; east: number }; latitude?: number; longitude?: number }) {
      const qs = new URLSearchParams();
      if (params.q) qs.set('q', params.q);
      if (params.categoryCode) qs.set('categoryCode', params.categoryCode);
      if (params.cityCode) qs.set('cityCode', params.cityCode);
      if (params.page) qs.set('page', String(params.page));
      if (params.type) qs.set('type', params.type);
      if (params.map) qs.set('map', 'true');
      if (params.boundaries) {
        qs.set('south', String(params.boundaries.south));
        qs.set('west', String(params.boundaries.west));
        qs.set('north', String(params.boundaries.north));
        qs.set('east', String(params.boundaries.east));
      }
      if (params.latitude !== undefined) qs.set('latitude', String(params.latitude));
      if (params.longitude !== undefined) qs.set('longitude', String(params.longitude));
      return request<SearchResults>(`/search?${qs}`);
    }
  }
};
