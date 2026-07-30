import { IdentityRepository } from '../identity/identity.repository';
import { IdentityService } from '../identity/identity.service';
import { CreateIncidentRequest, CreateOperationsChangeRequest, RollbackRequest } from './dto/operations-product.dto';
import { OperationsProductRepository } from './operations-product.repository';
import { OperationsRbacService } from './operations-rbac.service';
export declare class OperationsProductService {
    private readonly identity;
    private readonly identityRepository;
    private readonly rbac;
    private readonly repository;
    constructor(identity: IdentityService, identityRepository: IdentityRepository, rbac: OperationsRbacService, repository: OperationsProductRepository);
    private actor;
    overview(cookie: string | undefined): {
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
    inventory(cookie: string | undefined): {
        name: string;
        management: string;
        secretsExposed: boolean;
    }[];
    histories(cookie: string | undefined): {
        builds: never[];
        deployments: never[];
        releases: never[];
        changes: import("./operations-product.types").OperationsChange[];
        incidents: import("./operations-product.repository").IncidentRecord[];
        audit: import("./operations-product.types").OperationsAuditRecord[];
    };
    requestChange(cookie: string | undefined, input: CreateOperationsChangeRequest): {
        id: `${string}-${string}-${string}-${string}-${string}`;
        area: "production" | "google-cloud" | "firebase" | "ci-cd" | "monitoring" | "security";
        action: string;
        reason: string;
        status: "pending_approval";
        actorUserId: string;
        createdAt: string;
    };
    createIncident(cookie: string | undefined, input: CreateIncidentRequest): {
        id: `${string}-${string}-${string}-${string}-${string}`;
        status: "open";
        createdAt: string;
        title: string;
        severity: string;
        summary: string;
    };
    rollback(cookie: string | undefined, input: RollbackRequest): {
        id: `${string}-${string}-${string}-${string}-${string}`;
        area: "production";
        action: string;
        reason: string;
        status: "pending_approval";
        actorUserId: string;
        createdAt: string;
    };
    private requestChangeFor;
    private audit;
}
