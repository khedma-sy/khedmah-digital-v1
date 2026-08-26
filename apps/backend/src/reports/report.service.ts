import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { getRequestContext } from '../context/request-context';
import { IdentityRepository } from '../identity/identity.repository';
import { IdentityService } from '../identity/identity.service';
import { readSessionToken } from '../identity/session-cookie';
import { ReportTarget, ReviewProviderReportRequest, SubmitProviderReportRequest } from './dto/report.dto';
import { OperationsRbacService } from '../operations-product/operations-rbac.service';
import { ReportAlreadyOpenError, ReportTargetUnavailableError } from './report.errors';
import { ReportRepository } from './report.repository';
import { ProviderReport, PublicProviderReportReceipt } from './report.types';
import { validateProviderReport, validateProviderReportReview, validateReportTargetId } from './report.validation';

@Injectable()
export class ReportService {
  constructor(
    @Inject(ReportRepository) private readonly reports: ReportRepository,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(IdentityRepository) private readonly auditLogs: IdentityRepository,
    @Inject(OperationsRbacService) private readonly rbac: OperationsRbacService
  ) {}

  async submit(cookieHeader: string | undefined, targetValue: ReportTarget, request: SubmitProviderReportRequest): Promise<PublicProviderReportReceipt> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    const target = { ...targetValue, id: validateReportTargetId(targetValue.id) };
    const input = validateProviderReport(request);
    if (!await this.reports.isPublicTarget(target.type, target.id)) throw new ReportTargetUnavailableError();
    const report: ProviderReport = { id: randomUUID(), reporterUserId: actor.id, targetType: target.type, targetId: target.id, reasonCode: input.reasonCode, details: input.details, status: 'submitted', createdAt: new Date().toISOString() };
    try { await this.reports.create(report); }
    catch (error) { if ((error as { code?: string })?.code === '23505') throw new ReportAlreadyOpenError(); throw error; }
    const context = getRequestContext();
    await this.auditLogs.appendAuditLog('provider.report.submitted', { actorUserId: actor.id, requestId: context?.requestId, correlationId: context?.correlationId });
    return { id: report.id, targetType: report.targetType, targetId: report.targetId, status: report.status, createdAt: report.createdAt };
  }

  async listForModeration(cookieHeader: string | undefined) {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    this.rbac.assert(actor.email, 'security.manage');
    return this.reports.listForModeration();
  }

  async review(cookieHeader: string | undefined, idValue: string, request: ReviewProviderReportRequest) {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookieHeader));
    this.rbac.assert(actor.email, 'security.manage');
    const id = validateReportTargetId(idValue); const input = validateProviderReportReview(request);
    if (!await this.reports.review(id, actor.id, input.status, input.note)) throw new NotFoundException('Report is unavailable for review.');
    const context = getRequestContext();
    await this.auditLogs.appendAuditLog('provider.report.reviewed', { actorUserId: actor.id, requestId: context?.requestId, correlationId: context?.correlationId });
    return { id, status: input.status };
  }
}
