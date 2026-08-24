import type { PublicUserProfile } from './api-client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function identityRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}/api/v1${path}`, {
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

export const identityApi = {
  register(email: string, password: string, displayName: string) {
    return identityRequest<{ user: PublicUserProfile; verificationRequired: true }>('/auth/register', {
      method: 'POST', body: JSON.stringify({ email, password, displayName })
    });
  },
  google(idToken: string) {
    return identityRequest<{ user: PublicUserProfile }>('/auth/google', {
      method: 'POST', body: JSON.stringify({ idToken })
    });
  },
  forgotPassword(email: string) {
    return identityRequest<{ message: string }>('/auth/forgot-password', {
      method: 'POST', body: JSON.stringify({ email })
    });
  },
  resetPassword(token: string, newPassword: string) {
    return identityRequest<{ message: string }>('/auth/reset-password', {
      method: 'POST', body: JSON.stringify({ token, newPassword })
    });
  },
  requestEmailVerification(email: string) {
    return identityRequest<{ message: string }>('/auth/email-verification/request', {
      method: 'POST', body: JSON.stringify({ email })
    });
  },
  confirmEmailVerification(token: string) {
    return identityRequest<{ message: string; email: string }>('/auth/email-verification/confirm', {
      method: 'POST', body: JSON.stringify({ token })
    });
  }
};
