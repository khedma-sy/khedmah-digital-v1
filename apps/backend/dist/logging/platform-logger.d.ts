import { ConsoleLogger } from '@nestjs/common';
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
export declare class PlatformLogger extends ConsoleLogger {
    private readonly serviceName;
    constructor();
    logRequestLifecycle(context: RequestLifecycleLog): void;
    logErrorContext(context: ErrorContextLog): void;
}
export {};
