import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { getRequestContext } from '../context/request-context';
import { IdentityRepository } from '../identity/identity.repository';
import { AnalyticsRepository } from '../analytics/analytics.repository';
import { IdentityService } from '../identity/identity.service';
import { readSessionToken } from '../identity/session-cookie';
import { CreateIncidentRequest, CreateOperationsChangeRequest, RollbackRequest } from './dto/operations-product.dto';
import { OperationsProductRepository } from './operations-product.repository';
import { OperationsRbacService } from './operations-rbac.service';
import { advertisingPolicy, plannedAdvertisingPackages } from '../products/product-policy';
@Injectable()
export class OperationsProductService {
  constructor(@Inject(IdentityService) private readonly identity: IdentityService, @Inject(IdentityRepository) private readonly identityRepository: IdentityRepository, @Inject(OperationsRbacService) private readonly rbac: OperationsRbacService, @Inject(OperationsProductRepository) private readonly repository: OperationsProductRepository, @Inject(AnalyticsRepository) private readonly analytics: AnalyticsRepository) {}
  private async actor(cookie: string | undefined, permission: Parameters<OperationsRbacService['assert']>[1]) {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookie)); const roles = this.rbac.assert(actor.email, permission); const permissions = this.rbac.permissionsFor(actor.email); return { actor, roles, permissions };
  }
  async overview(cookie: string | undefined) {
    const { roles, permissions } = await this.actor(cookie, 'operations.read');
    const enabled = (name: string) => process.env[name] === 'true';
    return { division: 'Operations Product', roles, permissions, health: { status: 'ready', productionTrafficEnabled: false },
      services: [
        { id: 'google-cloud', label: 'Google Cloud', status: process.env.GOOGLE_CLOUD_PROJECT ? 'configured' : 'configuration_required' },
        { id: 'firebase', label: 'Firebase', status: process.env.FIREBASE_PROJECT_ID ? 'configured' : 'configuration_required' },
        { id: 'ci-cd', label: 'CI/CD', status: 'configured' },
        { id: 'monitoring', label: 'Monitoring', status: enabled('GOOGLE_MONITORING_ENABLED') ? 'enabled' : 'disabled_pre_launch' },
        { id: 'logging', label: 'Cloud Logging', status: enabled('GOOGLE_LOGGING_ENABLED') ? 'enabled' : 'disabled_pre_launch' }
      ], openIncidents: await this.repository.countOpenIncidents(), pendingChanges: this.repository.listChanges().length };
  }
  async smartAdminReport(cookie: string | undefined) {
    await this.actor(cookie, 'operations.read');
    const periodDays = 30;
    const [analytics, productAuditCounts] = await Promise.all([
      this.analytics.adminSummary(periodDays),
      this.identityRepository.countAuditEvents(['product.auto_approved', 'product.auto_review_required'], periodDays)
    ]);
    const recommendations: Array<{ priority: 'high' | 'medium' | 'low'; title: string; reason: string; action: string }> = [];
    if (analytics.unmetSearches.length) recommendations.push({ priority: 'high', title: 'طلب غير ملبّى', reason: `${analytics.unmetSearches.length} عبارات بحث متكررة لم تنتج نتائج كافية.`, action: 'راجع التصنيفات واستقطب مزودين لهذه الخدمات.' });
    if (analytics.eventCounts.search_action > 0 && analytics.eventCounts.contact_click === 0) recommendations.push({ priority: 'high', title: 'انقطاع قبل التواصل', reason: 'توجد عمليات بحث دون نقرات تواصل مسجلة.', action: 'راجع جودة النتائج وبطاقات مقدمي الخدمة.' });
    if (analytics.totalEvents === 0) recommendations.push({ priority: 'medium', title: 'بيانات غير كافية', reason: 'لا توجد أحداث استخدام ضمن فترة التقرير.', action: 'تحقق من تفعيل تسجيل الأحداث في Preview قبل اتخاذ قرار.' });
    return {
      generatedAt: new Date().toISOString(),
      privacy: { aggregationOnly: true, minimumSearchCohort: 3, rawUserTextExposed: false },
      analytics,
      productModeration: {
        periodDays,
        autoApproved: productAuditCounts['product.auto_approved'] ?? 0,
        reviewRequired: productAuditCounts['product.auto_review_required'] ?? 0,
        policyVersion: 'product-auto-v1' as const
      },
      recommendations,
      automation: { canAutoApproveEligibleProducts: true, humanApprovalRequiredForExceptions: true }
    };
  }
  async listUsers(cookie:string|undefined,query=''){await this.actor(cookie,'users.manage');return this.identityRepository.listAccountsForAdmin(query.slice(0,100));}
  async orderMonitor(cookie:string|undefined){await this.actor(cookie,'orders.monitor');return this.repository.orderMonitor();}
  async catalogMonitor(cookie:string|undefined){await this.actor(cookie,'catalog.manage');return this.repository.catalogMonitor();}
  async platformMetrics(cookie:string|undefined){await this.actor(cookie,'operations.read');return this.repository.platformMetrics();}
  async contentGovernance(cookie:string|undefined){await this.actor(cookie,'security.manage');return this.repository.contentGovernance(advertisingPolicy(),plannedAdvertisingPackages());}
  async changeCategoryStatus(cookie:string|undefined,code:string,status:'active'|'inactive',reason:string){const{actor}=await this.actor(cookie,'catalog.manage');const clean=reason.trim();const context=getRequestContext();try{const result=await this.repository.changeCategoryStatus({code,status,reason:clean,actorUserId:actor.id,requestId:context?.requestId,correlationId:context?.correlationId});if(!result)throw new NotFoundException('Category was not found.');return result;}catch(error){if(error instanceof Error&&error.message==='CATEGORY_HAS_LIVE_USAGE')throw new BadRequestException('A category with live activities, services, products or children cannot be deactivated.');if(error instanceof Error&&error.message==='CATEGORY_STATUS_UNCHANGED')throw new BadRequestException('Category already has the requested status.');throw error;}}
  async changeUserStatus(cookie:string|undefined,targetUserId:string,status:'active'|'suspended',reason:string){const {actor}=await this.actor(cookie,'users.manage');if(actor.id===targetUserId)throw new ForbiddenException('Administrators cannot change their own account status.');const target=await this.identityRepository.findAccountById(targetUserId);if(!target)throw new NotFoundException('User was not found.');if((await this.identityRepository.findAdminRoles(targetUserId)).length)throw new ForbiddenException('Administrator accounts require a separate privileged review.');if(target.status===status)throw new BadRequestException('Account already has the requested status.');const cleanReason=reason.trim();if(cleanReason.length<5||cleanReason.length>500)throw new BadRequestException('Reason must be between 5 and 500 characters.');const context=getRequestContext();let changed;try{changed=await this.identityRepository.changeAccountStatus({targetUserId,actorUserId:actor.id,status,reason:cleanReason,requestId:context?.requestId,correlationId:context?.correlationId});}catch(error){if(error instanceof Error&&error.message==='USER_STATUS_NOT_MANAGEABLE')throw new BadRequestException('Pending or archived accounts cannot be changed here.');throw error;}await this.identityRepository.appendAuditLog(status==='suspended'?'admin.user.suspended':'admin.user.reactivated',{actorUserId:actor.id,requestId:context?.requestId,correlationId:context?.correlationId});return{user:{id:target.id,email:target.email,status:changed.newStatus,createdAt:target.createdAt,updatedAt:new Date().toISOString()},previousStatus:changed.previousStatus};}
  async inventory(cookie: string | undefined) { await this.actor(cookie, 'operations.read'); return [
    'Cloud Run', 'Cloud Build', 'Artifact Registry', 'Secret Manager', 'IAM', 'Cloud Storage', 'Cloud Logging', 'Cloud Monitoring',
    'Service Accounts', 'Networking', 'Domains', 'SSL Certificates', 'Firebase Auth', 'Analytics', 'Cloud Messaging', 'Crashlytics',
    'Remote Config', 'App Check', 'Hosting', 'Google OAuth', 'Google Identity', 'Maps', 'Places', 'Geocoding', 'Directions'
  ].map(name => ({ name, management: 'configuration_driven', secretsExposed: false })); }
  async histories(cookie: string | undefined) { await this.actor(cookie, 'operations.read'); return { builds: [], deployments: [], releases: [], changes: this.repository.listChanges(), incidents: await this.repository.listIncidents(), audit: this.repository.listAudit() }; }
  async requestChange(cookie: string | undefined, input: CreateOperationsChangeRequest) { const { actor } = await this.actor(cookie, 'infrastructure.manage'); const change = { id: randomUUID(), area: input.area, action: input.action.trim(), reason: input.reason.trim(), status: 'pending_approval' as const, actorUserId: actor.id, createdAt: new Date().toISOString() }; this.repository.saveChange(change); await this.audit(actor.id, 'operations.change.requested', `${input.area}:${input.action}`); return change; }
  async createIncident(cookie: string | undefined, input: CreateIncidentRequest) { const { actor } = await this.actor(cookie, 'incidents.manage'); const context=getRequestContext();const incident = await this.repository.saveIncident({ title: input.title.trim(), category:input.category, severity: input.severity, summary: input.summary.trim(),reporterUserId:actor.id,requestId:context?.requestId,correlationId:context?.correlationId }); await this.audit(actor.id, 'operations.incident.created', incident.id); return incident; }
  async transitionIncident(cookie:string|undefined,id:string,input:{status:'open'|'in_progress'|'verification'|'resolved';note:string;assigneeUserId?:string}){const {actor}=await this.actor(cookie,'incidents.manage');const context=getRequestContext();try{const incident=await this.repository.transitionIncident({id,actorUserId:actor.id,status:input.status,note:input.note.trim(),assigneeUserId:input.assigneeUserId,requestId:context?.requestId,correlationId:context?.correlationId});if(!incident)throw new NotFoundException('Incident was not found.');return incident;}catch(error){if(error instanceof Error&&error.message==='INVALID_INCIDENT_TRANSITION')throw new BadRequestException('Incident transition is not allowed.');if(error instanceof Error&&error.message==='INCIDENT_ASSIGNEE_REQUIRED')throw new BadRequestException('An assignee is required before work starts.');throw error;}}
  async rollback(cookie: string | undefined, input: RollbackRequest) { const { actor } = await this.actor(cookie, 'releases.manage'); const change = await this.requestChangeFor(actor.id, 'production', `rollback:${input.deploymentId}`, input.reason); return change; }
  private async requestChangeFor(actorUserId: string, area: 'production', action: string, reason: string) { const change = { id: randomUUID(), area, action, reason: reason.trim(), status: 'pending_approval' as const, actorUserId, createdAt: new Date().toISOString() }; this.repository.saveChange(change); await this.audit(actorUserId, 'operations.rollback.requested', action); return change; }
  private async audit(actorUserId: string, action: string, resource: string) { const context = getRequestContext(); this.repository.audit({ actorUserId, action, resource, requestId: context?.requestId, correlationId: context?.correlationId });
    await this.identityRepository.appendAuditLog(action as 'operations.change.requested' | 'operations.rollback.requested' | 'operations.incident.created', { actorUserId, requestId: context?.requestId, correlationId: context?.correlationId }); }
}
