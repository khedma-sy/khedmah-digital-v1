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
  }
};
