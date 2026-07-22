export type PlatformEnvironment = 'development' | 'staging' | 'production';

export interface PlatformConfig {
  readonly environment: PlatformEnvironment;
  readonly port: number;
  readonly version: string;
  readonly serviceName: 'khedmah-digital-v1-backend';
}

const DEFAULT_PORT = 3001;
const DEFAULT_VERSION = '0.1.0';
const SUPPORTED_ENVIRONMENTS = new Set<PlatformEnvironment>(['development', 'staging', 'production']);

function parseEnvironment(value: string | undefined): PlatformEnvironment {
  if (value && SUPPORTED_ENVIRONMENTS.has(value as PlatformEnvironment)) {
    return value as PlatformEnvironment;
  }

  return 'development';
}

function parsePort(value: string | undefined): number {
  if (!value) {
    return DEFAULT_PORT;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    return DEFAULT_PORT;
  }

  return parsed;
}

function parseVersion(value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    return DEFAULT_VERSION;
  }

  return value.trim();
}

export function loadPlatformConfig(): PlatformConfig {
  return {
    environment: parseEnvironment(process.env.NODE_ENV),
    port: parsePort(process.env.PORT),
    version: parseVersion(process.env.APP_VERSION),
    serviceName: 'khedmah-digital-v1-backend'
  };
}
