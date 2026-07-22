import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { PlatformLogger } from './logging/platform-logger';
import { createRequestContextMiddleware } from './middleware/request-context.middleware';

export async function createBackendApp() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true
  });
  const logger = app.get(PlatformLogger);

  app.useLogger(logger);
  app.use(createRequestContextMiddleware(logger));
  app.setGlobalPrefix('api/v1');
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
