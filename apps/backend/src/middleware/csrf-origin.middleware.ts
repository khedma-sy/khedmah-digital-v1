import type { NextFunction, Request, Response } from 'express';

const SESSION_COOKIE_NAME = 'khedmah_session';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const DEPLOYED_ENVIRONMENTS = new Set(['production', 'preview', 'staging']);
const DEVELOPMENT_ORIGIN = 'http://localhost:3000';

function hasSessionCookie(cookieHeader: string | undefined): boolean {
  if (!cookieHeader) return false;

  return cookieHeader
    .split(';')
    .map((cookie) => cookie.trim())
    .some((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`));
}

export function configuredOrigins(): string[] {
  const configured = process.env.CORS_ORIGIN
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (configured?.length) return configured;

  const environment = process.env.NODE_ENV?.trim().toLowerCase() ?? '';
  // Deployed environments must never inherit another environment's browser origin.
  if (DEPLOYED_ENVIRONMENTS.has(environment)) return [];

  // Local development remains usable without cloud configuration.
  return [DEVELOPMENT_ORIGIN];
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

    const nativeClient = request.headers['x-khedmah-client'];
    if (nativeClient === 'android' && !request.headers.origin && !request.headers.referer) {
      next();
      return;
    }

    const allowedOrigins = new Set(configuredOrigins());
    const originHeader =
      typeof request.headers.origin === 'string'
        ? request.headers.origin
        : undefined;

    if (originHeader) {
      if (allowedOrigins.has(originHeader)) {
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

    if (refererHeader && allowedOrigins.has(originFromReferer(refererHeader) ?? '')) {
      next();
      return;
    }

    response.status(403).json({
      statusCode: 403,
      message: 'Request origin is not allowed.'
    });
  };
}
