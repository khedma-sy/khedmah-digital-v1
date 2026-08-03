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
    search(params: { q?: string; cityCode?: string; availability?: string; page?: number }) {
      const qs = new URLSearchParams();
      if (params.q) qs.set('q', params.q);
      if (params.cityCode) qs.set('cityCode', params.cityCode);
      if (params.availability) qs.set('availability', params.availability);
      if (params.page) qs.set('page', String(params.page));
      return request<{ professionals: PublicProfessionalProfile[]; page: number }>(`/professionals/search?${qs}`);
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
    query(params: { q?: string; categoryCode?: string; cityCode?: string; page?: number; type?: string }) {
      const qs = new URLSearchParams();
      if (params.q) qs.set('q', params.q);
      if (params.categoryCode) qs.set('categoryCode', params.categoryCode);
      if (params.cityCode) qs.set('cityCode', params.cityCode);
      if (params.page) qs.set('page', String(params.page));
      if (params.type) qs.set('type', params.type);
      return request<SearchResults>(`/search?${qs}`);
    }
  }
};
