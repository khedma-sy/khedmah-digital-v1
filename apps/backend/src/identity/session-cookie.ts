import type { Response } from 'express';

const COOKIE_NAME = 'khedmah_session';
const MAX_AGE_SECONDS = 60 * 60;

function isHttpsDeployment(): boolean {
  return ['production', 'preview', 'staging'].includes(process.env.NODE_ENV ?? '');
}

function sessionCookieSameSite(): 'none' | 'strict' | 'lax' {
  if (!isHttpsDeployment()) return 'strict';
  // Cross-site Floot deployments still require None. Enable Lax only after
  // the deployment routes all credentialed browser calls through one site.
  return process.env.SESSION_COOKIE_SAME_SITE?.trim().toLowerCase() === 'lax' ? 'lax' : 'none';
}

export function readSessionToken(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  const cookies = cookieHeader.split(';').map((cookie) => cookie.trim());
  const sessionCookie = cookies.find((cookie) => cookie.startsWith(`${COOKIE_NAME}=`));
  if (!sessionCookie) {
    return undefined;
  }

  try {
    return decodeURIComponent(sessionCookie.slice(COOKIE_NAME.length + 1)) || undefined;
  } catch {
    // A malformed client cookie is unauthenticated input, not a server failure.
    return undefined;
  }
}

export function attachSessionCookie(response: Response, token: string): void {
  response.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: sessionCookieSameSite(),
    secure: isHttpsDeployment(),
    maxAge: MAX_AGE_SECONDS * 1000,
    path: '/api/v1'
  });
}

export function clearSessionCookie(response: Response): void {
  response.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: sessionCookieSameSite(),
    secure: isHttpsDeployment(),
    path: '/api/v1'
  });
}
