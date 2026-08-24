import type { PublicUserProfile } from './api-client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (data as { message?: string | string[] }).message ?? `خطأ في الخادم (${response.status})`;
    throw Object.assign(new Error(Array.isArray(message) ? message.join('. ') : message), { statusCode: response.status });
  }
  return data as T;
}

export const productionAuth = {
  forgotPassword(email: string) {
    return post<{ message: string }>('/auth/forgot-password', { email });
  },
  resetPassword(token: string, newPassword: string) {
    return post<{ message: string }>('/auth/reset-password', { token, newPassword });
  },
  confirmEmail(token: string) {
    return post<{ message: string; email: string }>('/auth/email-verification/confirm', { token });
  },
  resendVerification(email: string) {
    return post<{ message: string }>('/auth/email-verification/resend', { email });
  },
  google(idToken: string) {
    return post<{ user: PublicUserProfile }>('/auth/google', { idToken });
  }
};
