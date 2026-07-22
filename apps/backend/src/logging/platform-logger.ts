import { ConsoleLogger, Injectable, LogLevel } from '@nestjs/common';
import { loadPlatformConfig } from '../config/platform-config';

interface RequestLifecycleLog {
  readonly requestId: string;
  readonly correlationId: string;
  readonly method: string;
  readonly path: string;
  readonly statusCode: number;
  readonly durationMs: number;
}

interface ErrorContextLog {
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly statusCode: number;
  readonly code: string;
}

@Injectable()
export class PlatformLogger extends ConsoleLogger {
  private readonly serviceName = loadPlatformConfig().serviceName;

  constructor() {
    super('KhedmahDigitalV1', {
      timestamp: true,
      logLevels: ['log', 'error', 'warn', 'debug'] satisfies LogLevel[]
    });
  }

  logRequestLifecycle(context: RequestLifecycleLog): void {
    this.log({
      timestamp: new Date().toISOString(),
      level: 'log',
      serviceName: this.serviceName,
      event: 'request_completed',
      requestId: context.requestId,
      correlationId: context.correlationId,
      method: context.method,
      path: context.path,
      statusCode: context.statusCode,
      durationMs: context.durationMs
    });
  }

  logErrorContext(context: ErrorContextLog): void {
    this.error({
      timestamp: new Date().toISOString(),
      level: 'error',
      serviceName: this.serviceName,
      event: 'request_failed',
      requestId: context.requestId,
      correlationId: context.correlationId,
      statusCode: context.statusCode,
      code: context.code
    });
  }
}
