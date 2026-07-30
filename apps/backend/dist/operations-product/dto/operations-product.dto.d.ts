export declare class CreateOperationsChangeRequest {
    readonly area: 'google-cloud' | 'firebase' | 'ci-cd' | 'production' | 'monitoring' | 'security';
    readonly action: string;
    readonly reason: string;
}
export declare class CreateIncidentRequest {
    readonly title: string;
    readonly severity: 'low' | 'medium' | 'high' | 'critical';
    readonly summary: string;
}
export declare class RollbackRequest {
    readonly deploymentId: string;
    readonly reason: string;
}
