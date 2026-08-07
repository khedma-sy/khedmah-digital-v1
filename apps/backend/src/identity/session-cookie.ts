import type { Response } from 'express';

const COOKIE_NAME = 'khedmah_session';
const MAX_AGE_SECONDS = 60 * 60;

function sessionCookieSameSite(): 'none' | 'strict' {
  return process.env.NODE_ENV === 'production' ? 'none' : 'strict';
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

  return decodeURIComponent(sessionCookie.slice(COOKIE_NAME.length + 1));
}

export function attachSessionCookie(response: Response, token: string): void {
  response.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: sessionCookieSameSite(),
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE_SECONDS * 1000,
    path: '/api/v1'
  });
}

export function clearSessionCookie(response: Response): void {
  response.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: sessionCookieSameSite(),
    secure: process.env.NODE_ENV === 'production',
    path: '/api/v1'
  });
}
