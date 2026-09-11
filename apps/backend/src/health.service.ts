import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { loadPlatformConfig } from './config/platform-config';
import { DatabasePool } from './database/database.pool';

export interface HealthResponse {
  readonly status: 'ok';
  readonly timestamp: string;
  readonly version: string;
}

export interface ReadinessResponse {
  readonly status: 'ready';
  readonly timestamp: string;
  readonly dependencies: {
    readonly database: 'ok';
  };
}

@Injectable()
export class HealthService {
  constructor(@Inject(DatabasePool) private readonly db: DatabasePool) {}

  getHealth(): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: loadPlatformConfig().version
    };
  }

  async getReadiness(): Promise<ReadinessResponse> {
    try {
      await this.db.query('SELECT 1 AS ready');
    } catch {
      throw new ServiceUnavailableException('Platform dependencies are unavailable.');
    }

    return {
      status: 'ready',
      timestamp: new Date().toISOString(),
      dependencies: { database: 'ok' }
    };
  }
}
