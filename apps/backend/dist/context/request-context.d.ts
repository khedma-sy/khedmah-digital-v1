export interface RequestContextValue {
    readonly requestId: string;
    readonly correlationId: string;
    readonly startedAt: number;
}
export declare function runWithRequestContext<T>(context: RequestContextValue, callback: () => T): T;
export declare function getRequestContext(): RequestContextValue | undefined;
