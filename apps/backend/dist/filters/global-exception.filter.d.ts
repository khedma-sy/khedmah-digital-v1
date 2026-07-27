import { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { PlatformLogger } from '../logging/platform-logger';
export declare class GlobalExceptionFilter implements ExceptionFilter {
    private readonly logger;
    constructor(logger?: PlatformLogger);
    catch(exception: unknown, host: ArgumentsHost): void;
}
