import { Inject, Injectable } from '@nestjs/common';
import { IdentityService } from '../identity/identity.service';
import { readSessionToken } from '../identity/session-cookie';
import { OperationsRbacService } from '../operations-product/operations-rbac.service';
import { AiAdminRepository } from './ai-admin.repository';
import { AI_ADMIN_ANALYSIS_MODES } from './ai-admin.types';

@Injectable()
export class AiAdminService {
  constructor(
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(OperationsRbacService) private readonly rbac: OperationsRbacService,
    @Inject(AiAdminRepository) private readonly repository: AiAdminRepository
  ) {}

  async status(cookie: string | undefined) {
    await this.actor(cookie);
    const state = await this.repository.getControlState();
    return this.view(state);
  }

  async setEnabled(cookie: string | undefined, enabled: boolean) {
    const actor = await this.actor(cookie);
    const state = await this.repository.setEnabled(enabled, actor.id);
    return this.view(state);
  }

  private async actor(cookie: string | undefined) {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookie));
    this.rbac.assert(actor.email, 'ai.manage');
    return actor;
  }

  private view(state: Awaited<ReturnType<AiAdminRepository['getControlState']>>) {
    return {
      ...state,
      providerConfigured: Boolean(process.env.OPENAI_API_KEY),
      executionAvailable: false as const,
      phase: 'control_plane_only' as const,
      analysisModes: AI_ADMIN_ANALYSIS_MODES,
      capabilities: [
        'read_metrics',
        'detect_ui_failures',
        'review_operational_anomalies',
        'draft_admin_tasks'
      ] as const,
      approvalRequired: [
        'production_deploy',
        'role_change',
        'destructive_account_action',
        'pricing_or_policy_change'
      ] as const
    };
  }
}
