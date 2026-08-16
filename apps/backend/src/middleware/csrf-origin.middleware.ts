import type { NextFunction, Request, Response } from 'express';

const SESSION_COOKIE_NAME = 'khedmah_session';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function hasSessionCookie(cookieHeader: string | undefined): boolean {
  if (!cookieHeader) return false;

  return cookieHeader
    .split(';')
    .map((cookie) => cookie.trim())
    .some((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`));
}

function configuredOrigin(): string {
  return (
    process.env.CORS_ORIGIN ??
    'https://frontend-774201339973.europe-west1.run.app'
  );
}

function originFromReferer(referer: string): string | undefined {
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

export function createCsrfOriginMiddleware() {
  return (request: Request, response: Response, next: NextFunction): void => {
    const method = request.method.toUpperCase();

    if (SAFE_METHODS.has(method)) {
      next();
      return;
    }

    const cookieHeader = request.headers.cookie;

    // CSRF protection is required for unsafe requests authenticated
    // through the browser session cookie.
    if (!hasSessionCookie(cookieHeader)) {
      next();
      return;
    }

    const allowedOrigin = configuredOrigin();
    const originHeader =
      typeof request.headers.origin === 'string'
        ? request.headers.origin
        : undefined;

    if (originHeader) {
      if (originHeader === allowedOrigin) {
        next();
        return;
      }

      response.status(403).json({
        statusCode: 403,
        message: 'Request origin is not allowed.'
      });
      return;
    }

    const refererHeader =
      typeof request.headers.referer === 'string'
        ? request.headers.referer
        : undefined;

    if (refererHeader && originFromReferer(refererHeader) === allowedOrigin) {
      next();
      return;
    }

    response.status(403).json({
      statusCode: 403,
      message: 'Request origin is not allowed.'
    });
  };
}
