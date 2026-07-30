import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { getRequestContext } from '../context/request-context';
import { IdentityRepository } from '../identity/identity.repository';
import { IdentityService } from '../identity/identity.service';
import { readSessionToken } from '../identity/session-cookie';
import { CreateIncidentRequest, CreateOperationsChangeRequest, RollbackRequest } from './dto/operations-product.dto';
import { OperationsProductRepository } from './operations-product.repository';
import { OperationsRbacService } from './operations-rbac.service';
@Injectable()
export class OperationsProductService {
  constructor(@Inject(IdentityService) private readonly identity: IdentityService, @Inject(IdentityRepository) private readonly identityRepository: IdentityRepository, @Inject(OperationsRbacService) private readonly rbac: OperationsRbacService, @Inject(OperationsProductRepository) private readonly repository: OperationsProductRepository) {}
  private actor(cookie: string | undefined, permission: Parameters<OperationsRbacService['assert']>[1]) {
    const actor = this.identity.getCurrentUser(readSessionToken(cookie)); const roles = this.rbac.assert(actor.email, permission); return { actor, roles };
  }
  overview(cookie: string | undefined) {
    const { roles } = this.actor(cookie, 'operations.read');
    const enabled = (name: string) => process.env[name] === 'true';
    return { division: 'Operations Product', roles, health: { status: 'ready', productionTrafficEnabled: false },
      services: [
        { id: 'google-cloud', label: 'Google Cloud', status: process.env.GOOGLE_CLOUD_PROJECT ? 'configured' : 'configuration_required' },
        { id: 'firebase', label: 'Firebase', status: process.env.FIREBASE_PROJECT_ID ? 'configured' : 'configuration_required' },
        { id: 'ci-cd', label: 'CI/CD', status: 'configured' },
        { id: 'monitoring', label: 'Monitoring', status: enabled('GOOGLE_MONITORING_ENABLED') ? 'enabled' : 'disabled_pre_launch' },
        { id: 'logging', label: 'Cloud Logging', status: enabled('GOOGLE_LOGGING_ENABLED') ? 'enabled' : 'disabled_pre_launch' }
      ], openIncidents: this.repository.listIncidents().length, pendingChanges: this.repository.listChanges().length };
  }
  inventory(cookie: string | undefined) { this.actor(cookie, 'operations.read'); return [
    'Cloud Run', 'Cloud Build', 'Artifact Registry', 'Secret Manager', 'IAM', 'Cloud Storage', 'Cloud Logging', 'Cloud Monitoring',
    'Service Accounts', 'Networking', 'Domains', 'SSL Certificates', 'Firebase Auth', 'Analytics', 'Cloud Messaging', 'Crashlytics',
    'Remote Config', 'App Check', 'Hosting', 'Google OAuth', 'Google Identity', 'Maps', 'Places', 'Geocoding', 'Directions'
  ].map(name => ({ name, management: 'configuration_driven', secretsExposed: false })); }
  histories(cookie: string | undefined) { this.actor(cookie, 'operations.read'); return { builds: [], deployments: [], releases: [], changes: this.repository.listChanges(), incidents: this.repository.listIncidents(), audit: this.repository.listAudit() }; }
  requestChange(cookie: string | undefined, input: CreateOperationsChangeRequest) { const { actor } = this.actor(cookie, 'infrastructure.manage'); const change = { id: randomUUID(), area: input.area, action: input.action.trim(), reason: input.reason.trim(), status: 'pending_approval' as const, actorUserId: actor.id, createdAt: new Date().toISOString() }; this.repository.saveChange(change); this.audit(actor.id, 'operations.change.requested', `${input.area}:${input.action}`); return change; }
  createIncident(cookie: string | undefined, input: CreateIncidentRequest) { const { actor } = this.actor(cookie, 'incidents.manage'); const incident = this.repository.saveIncident({ title: input.title.trim(), severity: input.severity, summary: input.summary.trim() }); this.audit(actor.id, 'operations.incident.created', incident.id); return incident; }
  rollback(cookie: string | undefined, input: RollbackRequest) { const { actor } = this.actor(cookie, 'releases.manage'); const change = this.requestChangeFor(actor.id, 'production', `rollback:${input.deploymentId}`, input.reason); return change; }
  private requestChangeFor(actorUserId: string, area: 'production', action: string, reason: string) { const change = { id: randomUUID(), area, action, reason: reason.trim(), status: 'pending_approval' as const, actorUserId, createdAt: new Date().toISOString() }; this.repository.saveChange(change); this.audit(actorUserId, 'operations.rollback.requested', action); return change; }
  private audit(actorUserId: string, action: string, resource: string) { const context = getRequestContext(); this.repository.audit({ actorUserId, action, resource, requestId: context?.requestId, correlationId: context?.correlationId });
    this.identityRepository.appendAuditLog(action as 'operations.change.requested' | 'operations.rollback.requested' | 'operations.incident.created', { actorUserId, requestId: context?.requestId, correlationId: context?.correlationId }); }
}
