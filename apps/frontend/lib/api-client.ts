// Browser requests stay on the frontend origin. Next.js proxies /api/v1 to the
// backend so the session cookie is first-party in production.
const API_BASE = '';

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

export interface PublicOrganizationMember {
  readonly id: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly role: 'owner' | 'member';
  readonly status: 'active' | 'removed';
}

export interface OperationsProductOverview {
  readonly division: 'Operations Product';
  readonly roles: string[];
  readonly permissions: string[];
  readonly health: {
    readonly status: 'ready';
    readonly productionTrafficEnabled: boolean;
  };
  readonly services: Array<{
    readonly id: string;
    readonly label: string;
    readonly status: string;
  }>;
  readonly openIncidents: number;
  readonly pendingChanges: number;
}

export interface PublicBusinessProfile {
  readonly id: string;
  readonly name: string;
  readonly descriptionAr?: string;
  readonly descriptionEn?: string;
  readonly visibility: 'public' | 'private';
  readonly moderationStatus: 'pending' | 'approved' | 'rejected' | 'suspended';
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

export interface Category {
  readonly code: string;
  readonly nameAr: string;
  readonly nameEn?: string;
  readonly status: 'active';
  readonly sortOrder: number;
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
  readonly contactEligibility?: {
    readonly visibility: 'public' | 'private' | 'internal';
    readonly moderationStatus: 'approved' | 'pending' | 'rejected' | 'suspended';
    readonly lifecycleStatus: 'created' | 'pending' | 'active' | 'suspended' | 'archived';
    readonly eligible: boolean;
  };
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

export interface UploadedMediaAsset {
  readonly id: string;
  readonly ownerType: 'business_profile' | 'professional_profile' | 'user';
  readonly ownerId: string;
  readonly filename: string;
  readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  readonly sizeBytes: number;
  readonly visibility: 'public' | 'private';
  readonly publicUrl?: string;
  readonly assetType?: MediaAsset['assetType'];
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
  readonly code?: string;
}

export interface PublicProviderReportReceipt {
  readonly id: string;
  readonly targetType: 'business' | 'professional';
  readonly targetId: string;
  readonly status: 'submitted';
  readonly createdAt: string;
}

export interface ModerationProviderReport {
  readonly id: string;
  readonly reporterUserId: string;
  readonly targetType: 'business' | 'professional';
  readonly targetId: string;
  readonly reasonCode: string;
  readonly details: string;
  readonly status: 'submitted' | 'in_review' | 'resolved' | 'dismissed';
  readonly resolutionNote?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ContactInquiryReceipt {
  readonly id: string;
  readonly targetType: 'business' | 'professional';
  readonly businessProfileId?: string;
  readonly professionalProfileId?: string;
  readonly status: 'submitted';
  readonly trackingStatus: 'submitted';
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
    throw Object.assign(new Error(text), {
      statusCode: response.status,
      code: (data as { code?: string }).code
    });
  }

  return data as T;
}

export const api = {
  contact: {
    submitInquiry(target: { type: 'business' | 'professional'; id: string }, data: { name: string; contactEmail: string; message: string }, idempotencyKey: string) {
      const collection = target.type === 'business' ? 'businesses' : 'professionals';
      return request<{ inquiry: ContactInquiryReceipt }>(`/${collection}/${target.id}/inquiries`, {
        method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(data)
      });
    }
  },
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
    },
    get(id: string) {
      return request<{ organization: PublicOrganization }>(`/organizations/${encodeURIComponent(id)}`);
    },
    update(id: string, name: string) {
      return request<{ organization: PublicOrganization }>(`/organizations/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ name })
      });
    },
    listMembers(id: string) {
      return request<{ members: PublicOrganizationMember[] }>(`/organizations/${encodeURIComponent(id)}/members`);
    },
    addMember(id: string, userId: string, role: PublicOrganizationMember['role']) {
      return request<{ member: PublicOrganizationMember }>(`/organizations/${encodeURIComponent(id)}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId, role })
      });
    },
    updateMember(id: string, memberId: string, data: { role?: PublicOrganizationMember['role']; status?: PublicOrganizationMember['status'] }) {
      return request<{ member: PublicOrganizationMember }>(`/organizations/${encodeURIComponent(id)}/members/${encodeURIComponent(memberId)}`, {
        method: 'PATCH',
        body: JSON.stringify(data)
      });
    },
    removeMember(id: string, memberId: string) {
      return request<{ status: 'ok' }>(`/organizations/${encodeURIComponent(id)}/members/${encodeURIComponent(memberId)}`, {
        method: 'DELETE'
      });
    }
  },
  operationsProduct: {
    overview() {
      return request<{ operationsProduct: OperationsProductOverview }>('/admin/operations-product/overview');
    }
  },
  categories: {
    list() { return request<{ categories: Category[] }>('/categories'); },
    get(code: string) { return request<{ category: Category }>(`/categories/${encodeURIComponent(code)}`); }
  },
  media: {
    uploadBusiness(id: string, data: { filename: string; mimeType: 'image/jpeg' | 'image/png' | 'image/webp'; sizeBytes: number; content: string; assetType: 'logo' | 'cover' | 'gallery'; sortOrder?: number }) {
      return request<UploadedMediaAsset>('/media', {
        method: 'POST',
        body: JSON.stringify({ ownerType: 'business_profile', ownerId: id, visibility: 'public', ...data })
      });
    },
    delete(id: string) { return request<{ deleted: boolean }>(`/media/${id}`, { method: 'DELETE' }); }
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
    listReceivedInquiries(id: string) {
      return request<{ inquiries: ProviderContactInquiry[] }>(`/businesses/${id}/inquiries`);
    },
    submitForReview(id: string) {
      return request<{ business: PublicBusinessProfile }>(`/businesses/${id}/submit`, { method: 'POST' });
    },
    approveModeration(id: string) {
      return request<{ business: PublicBusinessProfile }>(`/businesses/${id}/moderation/approve`, { method: 'POST' });
    },
    rejectModeration(id: string, reason: string) {
      return request<{ business: PublicBusinessProfile }>(`/businesses/${id}/moderation/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
    },
    suspend(id: string, reason: string) {
      return request<{ business: PublicBusinessProfile }>(`/businesses/${id}/suspend`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
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
    },
    submitForReview(id: string) {
      return request<{ professional: PublicProfessionalProfile }>(`/professionals/${id}/submit`, { method: 'POST' });
    },
    approveModeration(id: string) {
      return request<{ professional: PublicProfessionalProfile }>(`/professionals/${id}/moderation/approve`, { method: 'POST' });
    },
    rejectModeration(id: string, reason: string) {
      return request<{ professional: PublicProfessionalProfile }>(`/professionals/${id}/moderation/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
    },
    suspend(id: string, reason: string) {
      return request<{ professional: PublicProfessionalProfile }>(`/professionals/${id}/moderation/suspend`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
    }
  },
  moderation: {
    listPending() {
      return request<{ businesses: PublicBusinessProfile[]; professionals: PublicProfessionalProfile[] }>('/admin/moderation/pending');
    },
    listReports() {
      return request<{ reports: ModerationProviderReport[] }>('/admin/reports');
    },
    reviewReport(id: string, status: 'in_review' | 'resolved' | 'dismissed', note: string) {
      return request<{ report: { id: string; status: string } }>(`/admin/reports/${id}`, { method: 'PATCH', body: JSON.stringify({ status, note }) });
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
  },
  reports: {
    submit(target: { type: 'business' | 'professional'; id: string }, data: { reasonCode: string; details: string }) {
      const collection = target.type === 'business' ? 'businesses' : 'professionals';
      return request<{ report: PublicProviderReportReceipt }>(`/${collection}/${target.id}/reports`, { method: 'POST', body: JSON.stringify(data) });
    }
  }
};
