import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { runWithRequestContext } from '../context/request-context';
import { PlatformLogger } from '../logging/platform-logger';

const REQUEST_ID_HEADER = 'x-request-id';
const CORRELATION_ID_HEADER = 'x-correlation-id';

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function safeIdentifier(value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    return randomUUID();
  }

  return value.trim().slice(0, 128);
}

export function createRequestContextMiddleware(logger: PlatformLogger) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const requestId = safeIdentifier(firstHeaderValue(request.headers[REQUEST_ID_HEADER]));
    const correlationId = safeIdentifier(firstHeaderValue(request.headers[CORRELATION_ID_HEADER]) ?? requestId);
    const startedAt = Date.now();

    response.setHeader(REQUEST_ID_HEADER, requestId);
    response.setHeader(CORRELATION_ID_HEADER, correlationId);

    runWithRequestContext({ requestId, correlationId, startedAt }, () => {
      response.on('finish', () => {
        logger.logRequestLifecycle({
          requestId,
          correlationId,
          method: request.method,
          path: request.path,
          statusCode: response.statusCode,
          durationMs: Date.now() - startedAt
        });
      });

      next();
    });
  };
}
