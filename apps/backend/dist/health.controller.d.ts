import { HealthService, type HealthResponse } from './health.service';
export declare class HealthController {
    private readonly healthService;
    constructor(healthService: HealthService);
    getHealth(): HealthResponse;
}
