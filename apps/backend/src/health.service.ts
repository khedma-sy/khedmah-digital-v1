import { Injectable } from '@nestjs/common';
import { loadPlatformConfig } from './config/platform-config';

export interface HealthResponse {
  readonly status: 'ok';
  readonly timestamp: string;
  readonly version: string;
}

@Injectable()
export class HealthService {
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: loadPlatformConfig().version
    };
  }
}
