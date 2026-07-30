import { CreateIncidentRequest, CreateOperationsChangeRequest, RollbackRequest } from './dto/operations-product.dto';
import { OperationsProductService } from './operations-product.service';
export declare class OperationsProductController {
    private readonly service;
    constructor(service: OperationsProductService);
    overview(cookie: string | undefined): {
        operationsProduct: {
            division: string;
            roles: readonly ("operations_product_director" | "infrastructure_manager" | "cloud_administrator" | "devops_engineer" | "production_engineer" | "release_manager" | "security_operations_engineer" | "site_reliability_engineer")[];
            health: {
                status: string;
                productionTrafficEnabled: boolean;
            };
            services: {
                id: string;
                label: string;
                status: string;
            }[];
            openIncidents: number;
            pendingChanges: number;
        };
    };
    inventory(cookie: string | undefined): {
        resources: {
            name: string;
            management: string;
            secretsExposed: boolean;
        }[];
    };
    history(cookie: string | undefined): {
        builds: never[];
        deployments: never[];
        releases: never[];
        changes: import("./operations-product.types").OperationsChange[];
        incidents: import("./operations-product.repository").IncidentRecord[];
        audit: import("./operations-product.types").OperationsAuditRecord[];
    };
    requestChange(cookie: string | undefined, body: CreateOperationsChangeRequest): {
        change: {
            id: `${string}-${string}-${string}-${string}-${string}`;
            area: "production" | "google-cloud" | "firebase" | "ci-cd" | "monitoring" | "security";
            action: string;
            reason: string;
            status: "pending_approval";
            actorUserId: string;
            createdAt: string;
        };
    };
    createIncident(cookie: string | undefined, body: CreateIncidentRequest): {
        incident: {
            id: `${string}-${string}-${string}-${string}-${string}`;
            status: "open";
            createdAt: string;
            title: string;
            severity: string;
            summary: string;
        };
    };
    rollback(cookie: string | undefined, body: RollbackRequest): {
        change: {
            id: `${string}-${string}-${string}-${string}-${string}`;
            area: "production";
            action: string;
            reason: string;
            status: "pending_approval";
            actorUserId: string;
            createdAt: string;
        };
    };
}
