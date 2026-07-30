"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OperationsProductService = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const request_context_1 = require("../context/request-context");
const identity_repository_1 = require("../identity/identity.repository");
const identity_service_1 = require("../identity/identity.service");
const session_cookie_1 = require("../identity/session-cookie");
const operations_product_repository_1 = require("./operations-product.repository");
const operations_rbac_service_1 = require("./operations-rbac.service");
let OperationsProductService = class OperationsProductService {
    identity;
    identityRepository;
    rbac;
    repository;
    constructor(identity, identityRepository, rbac, repository) {
        this.identity = identity;
        this.identityRepository = identityRepository;
        this.rbac = rbac;
        this.repository = repository;
    }
    actor(cookie, permission) {
        const actor = this.identity.getCurrentUser((0, session_cookie_1.readSessionToken)(cookie));
        const roles = this.rbac.assert(actor.email, permission);
        return { actor, roles };
    }
    overview(cookie) {
        const { roles } = this.actor(cookie, 'operations.read');
        const enabled = (name) => process.env[name] === 'true';
        return { division: 'Operations Product', roles, health: { status: 'ready', productionTrafficEnabled: false },
            services: [
                { id: 'google-cloud', label: 'Google Cloud', status: process.env.GOOGLE_CLOUD_PROJECT ? 'configured' : 'configuration_required' },
                { id: 'firebase', label: 'Firebase', status: process.env.FIREBASE_PROJECT_ID ? 'configured' : 'configuration_required' },
                { id: 'ci-cd', label: 'CI/CD', status: 'configured' },
                { id: 'monitoring', label: 'Monitoring', status: enabled('GOOGLE_MONITORING_ENABLED') ? 'enabled' : 'disabled_pre_launch' },
                { id: 'logging', label: 'Cloud Logging', status: enabled('GOOGLE_LOGGING_ENABLED') ? 'enabled' : 'disabled_pre_launch' }
            ], openIncidents: this.repository.listIncidents().length, pendingChanges: this.repository.listChanges().length };
    }
    inventory(cookie) {
        this.actor(cookie, 'operations.read');
        return [
            'Cloud Run', 'Cloud Build', 'Artifact Registry', 'Secret Manager', 'IAM', 'Cloud Storage', 'Cloud Logging', 'Cloud Monitoring',
            'Service Accounts', 'Networking', 'Domains', 'SSL Certificates', 'Firebase Auth', 'Analytics', 'Cloud Messaging', 'Crashlytics',
            'Remote Config', 'App Check', 'Hosting', 'Google OAuth', 'Google Identity', 'Maps', 'Places', 'Geocoding', 'Directions'
        ].map(name => ({ name, management: 'configuration_driven', secretsExposed: false }));
    }
    histories(cookie) { this.actor(cookie, 'operations.read'); return { builds: [], deployments: [], releases: [], changes: this.repository.listChanges(), incidents: this.repository.listIncidents(), audit: this.repository.listAudit() }; }
    requestChange(cookie, input) { const { actor } = this.actor(cookie, 'infrastructure.manage'); const change = { id: (0, node_crypto_1.randomUUID)(), area: input.area, action: input.action.trim(), reason: input.reason.trim(), status: 'pending_approval', actorUserId: actor.id, createdAt: new Date().toISOString() }; this.repository.saveChange(change); this.audit(actor.id, 'operations.change.requested', `${input.area}:${input.action}`); return change; }
    createIncident(cookie, input) { const { actor } = this.actor(cookie, 'incidents.manage'); const incident = this.repository.saveIncident({ title: input.title.trim(), severity: input.severity, summary: input.summary.trim() }); this.audit(actor.id, 'operations.incident.created', incident.id); return incident; }
    rollback(cookie, input) { const { actor } = this.actor(cookie, 'releases.manage'); const change = this.requestChangeFor(actor.id, 'production', `rollback:${input.deploymentId}`, input.reason); return change; }
    requestChangeFor(actorUserId, area, action, reason) { const change = { id: (0, node_crypto_1.randomUUID)(), area, action, reason: reason.trim(), status: 'pending_approval', actorUserId, createdAt: new Date().toISOString() }; this.repository.saveChange(change); this.audit(actorUserId, 'operations.rollback.requested', action); return change; }
    audit(actorUserId, action, resource) {
        const context = (0, request_context_1.getRequestContext)();
        this.repository.audit({ actorUserId, action, resource, requestId: context?.requestId, correlationId: context?.correlationId });
        this.identityRepository.appendAuditLog(action, { actorUserId, requestId: context?.requestId, correlationId: context?.correlationId });
    }
};
exports.OperationsProductService = OperationsProductService;
exports.OperationsProductService = OperationsProductService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(identity_service_1.IdentityService)),
    __param(1, (0, common_1.Inject)(identity_repository_1.IdentityRepository)),
    __param(2, (0, common_1.Inject)(operations_rbac_service_1.OperationsRbacService)),
    __param(3, (0, common_1.Inject)(operations_product_repository_1.OperationsProductRepository)),
    __metadata("design:paramtypes", [identity_service_1.IdentityService, identity_repository_1.IdentityRepository, operations_rbac_service_1.OperationsRbacService, operations_product_repository_1.OperationsProductRepository])
], OperationsProductService);
//# sourceMappingURL=operations-product.service.js.map