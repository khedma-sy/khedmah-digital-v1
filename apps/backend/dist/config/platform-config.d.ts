export type PlatformEnvironment = 'development' | 'staging' | 'production';
export interface PlatformConfig {
    readonly environment: PlatformEnvironment;
    readonly port: number;
    readonly version: string;
    readonly serviceName: 'khedmah-digital-v1-backend';
}
export declare function loadPlatformConfig(): PlatformConfig;
