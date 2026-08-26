export interface ProviderReport {
  readonly id: string;
  readonly reporterUserId: string;
  readonly targetType: 'business' | 'professional';
  readonly targetId: string;
  readonly reasonCode: string;
  readonly details: string;
  readonly status: 'submitted';
  readonly createdAt: string;
}

export interface PublicProviderReportReceipt {
  readonly id: string;
  readonly targetType: 'business' | 'professional';
  readonly targetId: string;
  readonly status: 'submitted';
  readonly createdAt: string;
}

export interface ModerationProviderReport extends Omit<ProviderReport, 'status'> {
  readonly status: 'submitted' | 'in_review' | 'resolved' | 'dismissed';
  readonly resolutionNote?: string;
  readonly updatedAt: string;
}
