import { BadRequestException, PayloadTooLargeException, UnsupportedMediaTypeException } from '@nestjs/common';
import { json, type NextFunction, type Request, type Response } from 'express';

const ordinaryJson = json({ limit: '256kb' });
const uploadJson = json({ limit: '7mb' });

/** The two image uploads accept up to 5 MB encoded in JSON as base64. */
export function createJsonBodyMiddleware() {
  return (request: Request, response: Response, next: NextFunction): void => {
    const upload = request.method.toUpperCase() === 'POST' && (
      /^\/api\/v1\/media\/?$/i.test(request.path) ||
      /^\/api\/v1\/classifieds\/[^/]+\/media\/?$/i.test(request.path)
    );
    (upload ? uploadJson : ordinaryJson)(request, response, (error?: unknown) => {
      // body-parser errors are not Nest HttpExceptions; translate only known
      // client failures so the global filter returns 4xx without leaking input.
      const type = typeof error === 'object' && error !== null && 'type' in error
        ? (error as { type?: unknown }).type : undefined;
      if (type === 'entity.too.large') return next(new PayloadTooLargeException());
      if (type === 'entity.parse.failed' || type === 'request.size.invalid') return next(new BadRequestException());
      if (type === 'encoding.unsupported' || type === 'charset.unsupported') return next(new UnsupportedMediaTypeException());
      next(error);
    });
  };
}
