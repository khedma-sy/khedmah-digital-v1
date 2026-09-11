import type { NextFunction, Request, Response } from 'express';

const DEPLOYED_ENVIRONMENTS = new Set(['production', 'preview', 'staging']);

export function createSecurityHeadersMiddleware() {
  return (_request: Request, response: Response, next: NextFunction): void => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    const environment = process.env.NODE_ENV?.trim().toLowerCase() ?? '';
    if (DEPLOYED_ENVIRONMENTS.has(environment)) {
      response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    next();
  };
}
