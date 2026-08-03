import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { PlatformLogger } from './logging/platform-logger';
import { createRequestContextMiddleware } from './middleware/request-context.middleware';
import { createRateLimitMiddleware } from './middleware/rate-limit.middleware';

export async function createBackendApp() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true
  });
  const logger = app.get(PlatformLogger);

  app.useLogger(logger);
  app.use(createRequestContextMiddleware(logger));
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
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

  app.use('/api/v1/auth/register', createRateLimitMiddleware('auth.register', authWindowMs, authMax));
  app.use('/api/v1/auth/login', createRateLimitMiddleware('auth.login', authWindowMs, authMax));
  app.use('/api/v1/auth/email-verification/request', createRateLimitMiddleware('email.verify', authWindowMs, authMax));
  app.use('/api/v1/search', createRateLimitMiddleware('search', searchWindowMs, searchMax));
  app.use('/api/v1/contact', createRateLimitMiddleware('contact', publicWindowMs, publicMax));
  app.use('/api/v1/business-profiles', createRateLimitMiddleware('business-profiles', publicWindowMs, publicMax));
  app.use('/api/v1/professional-profiles', createRateLimitMiddleware('professional-profiles', publicWindowMs, publicMax));

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
