export interface SafeTelemetry { info(event: string, metadata?: Readonly<Record<string, string>>): void; error(event: string): void; }
/** Pre-launch default: no production data leaves the process. */
export const disabledGoogleTelemetry: SafeTelemetry = Object.freeze({ info: () => undefined, error: () => undefined });
