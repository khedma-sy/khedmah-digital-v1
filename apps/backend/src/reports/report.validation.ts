import { ReviewProviderReportRequest, SubmitProviderReportRequest } from './dto/report.dto';
import { ReportValidationError } from './report.errors';

const REASONS = new Set(['inaccurate_information', 'inappropriate_content', 'impersonation', 'closed_business', 'other']);
export function validateReportTargetId(value: unknown): string {
  if (typeof value !== 'string') throw new ReportValidationError();
  const id = value.trim();
  if (!id || id.length > 128) throw new ReportValidationError();
  return id;
}
export function validateProviderReport(input: SubmitProviderReportRequest) {
  if (!REASONS.has(input.reasonCode)) throw new ReportValidationError();
  if (typeof input.details !== 'string') throw new ReportValidationError();
  const details = input.details.trim();
  if (details.length < 10 || details.length > 1000) throw new ReportValidationError();
  return { reasonCode: input.reasonCode, details };
}

export function validateProviderReportReview(input: ReviewProviderReportRequest) {
  const statuses = ['in_review', 'resolved', 'dismissed'] as const;
  if (!statuses.includes(input?.status)) throw new ReportValidationError();
  const note = typeof input?.note === 'string' ? input.note.trim() : '';
  if (note.length < 5 || note.length > 1000) throw new ReportValidationError();
  return { status: input.status, note };
}
