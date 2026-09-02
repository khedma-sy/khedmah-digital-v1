import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { PlatformLogger } from './logging/platform-logger';
import { RateLimitRepository } from './database/rate-limit.repository';
import { createRequestContextMiddleware } from './middleware/request-context.middleware';
import { configuredOrigins, createCsrfOriginMiddleware } from './middleware/csrf-origin.middleware';
import { createRateLimitMiddleware } from './middleware/rate-limit.middleware';

export async function createBackendApp() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false
  });
  const logger = app.get(PlatformLogger);
  const rateLimitRepository = app.get(RateLimitRepository);

  app.useLogger(logger);
  app.useBodyParser('json', { limit: '7mb' });
  app.use(createRequestContextMiddleware(logger));
  app.use(createCsrfOriginMiddleware());
  app.enableCors({
    origin: configuredOrigins(),
    credentials: true
  });
  app.setGlobalPrefix('api/v1');

  // Global rate limiting on sensitive public endpoints
  const authWindowMs = parseInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS ?? '900000', 10); // 15 min
  const authMax = parseInt(process.env.RATE_LIMIT_AUTH_MAX ?? '20', 10);
  const searchWindowMs = parseInt(process.env.RATE_LIMIT_SEARCH_WINDOW_MS ?? '60000', 10);
  const searchMax = parseInt(process.env.RATE_LIMIT_SEARCH_MAX ?? '30', 10);
  const publicWindowMs = parseInt(process.env.RATE_LIMIT_PUBLIC_WINDOW_MS ?? '60000', 10);
  const publicMax = parseInt(process.env.RATE_LIMIT_PUBLIC_MAX ?? '60', 10);

  app.use('/api/v1/auth/register', createRateLimitMiddleware(rateLimitRepository, 'auth.register', authWindowMs, authMax));
  app.use('/api/v1/auth/login', createRateLimitMiddleware(rateLimitRepository, 'auth.login', authWindowMs, authMax));
  app.use('/api/v1/auth/email-verification/request', createRateLimitMiddleware(rateLimitRepository, 'email.verify', authWindowMs, authMax));
  app.use('/api/v1/search', createRateLimitMiddleware(rateLimitRepository, 'search', searchWindowMs, searchMax));
  app.use('/api/v1/analytics/events', createRateLimitMiddleware(rateLimitRepository, 'analytics.events', publicWindowMs, publicMax));
  app.use('/api/v1/mobility/requests', createRateLimitMiddleware(rateLimitRepository, 'mobility.requests', publicWindowMs, publicMax));
  app.use('/api/v1/contact', createRateLimitMiddleware(rateLimitRepository, 'contact', publicWindowMs, publicMax));
  app.use('/api/v1/business-profiles', createRateLimitMiddleware(rateLimitRepository, 'business-profiles', publicWindowMs, publicMax));
  app.use('/api/v1/professional-profiles', createRateLimitMiddleware(rateLimitRepository, 'professional-profiles', publicWindowMs, publicMax));

  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: false,
      validationError: {
        target: false,
        value: false
      },
      whitelist: true
    })
  );
  app.useGlobalFilters(new GlobalExceptionFilter(logger));

  return app;
}
