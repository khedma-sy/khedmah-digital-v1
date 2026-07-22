import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { getRequestContext } from '../context/request-context';
import { PlatformLogger } from '../logging/platform-logger';

interface ErrorResponseBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly timestamp: string;
    readonly requestId?: string;
    readonly correlationId?: string;
  };
}

function errorCodeForStatus(status: number): string {
  if (status === HttpStatus.BAD_REQUEST) {
    return 'validation_error';
  }

  if (status === HttpStatus.NOT_FOUND) {
    return 'not_found';
  }

  if (status >= 500) {
    return 'internal_error';
  }

  return 'request_error';
}

function safeMessageForStatus(status: number): string {
  if (status === HttpStatus.BAD_REQUEST) {
    return 'Request validation failed.';
  }

  if (status === HttpStatus.NOT_FOUND) {
    return 'Resource was not found.';
  }

  if (status >= 500) {
    return 'Unexpected platform error.';
  }

  return 'Request could not be completed.';
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger = new PlatformLogger()) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const requestContext = getRequestContext();
    const code = errorCodeForStatus(status);

    this.logger.logErrorContext({
      requestId: requestContext?.requestId,
      correlationId: requestContext?.correlationId,
      statusCode: status,
      code
    });

    const body: ErrorResponseBody = {
      error: {
        code,
        message: safeMessageForStatus(status),
        timestamp: new Date().toISOString(),
        requestId: requestContext?.requestId,
        correlationId: requestContext?.correlationId
      }
    };

    response.status(status).json(body);
  }
}
