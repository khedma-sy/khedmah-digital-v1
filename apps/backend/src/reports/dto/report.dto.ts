export type ReportTarget = { readonly type: 'business' | 'professional'; readonly id: string };

export interface SubmitProviderReportRequest {
  readonly reasonCode: 'inaccurate_information' | 'inappropriate_content' | 'impersonation' | 'closed_business' | 'other';
  readonly details: string;
}

export interface ReviewProviderReportRequest {
  readonly status: 'in_review' | 'resolved' | 'dismissed';
  readonly note: string;
}
