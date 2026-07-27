export interface HealthResponse {
    readonly status: 'ok';
    readonly timestamp: string;
    readonly version: string;
}
export declare class HealthService {
    getHealth(): HealthResponse;
}
