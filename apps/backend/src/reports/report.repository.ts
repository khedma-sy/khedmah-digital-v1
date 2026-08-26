import { Inject, Injectable } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { ModerationProviderReport, ProviderReport } from './report.types';

@Injectable()
export class ReportRepository {
  constructor(@Inject(DatabasePool) private readonly db: DatabasePool) {}

  async isPublicTarget(type: 'business' | 'professional', id: string): Promise<boolean> {
    if (type === 'business') {
      const rows = await this.db.query(`SELECT id FROM business_profiles WHERE id=$1 AND visibility='public' AND moderation_status='approved' AND trust_status='approved' AND status='active'`, [id]);
      return rows.length === 1;
    }
    const rows = await this.db.query(`SELECT professional_profile_identifier FROM professional_profiles WHERE professional_profile_identifier=$1 AND visibility='public' AND moderation_status='approved' AND lifecycle_status='active'`, [id]);
    return rows.length === 1;
  }

  async create(report: ProviderReport): Promise<void> {
    await this.db.query(
      `INSERT INTO provider_reports (report_identifier,reporter_user_identifier,target_type,business_profile_id,professional_profile_identifier,reason_code,details,status,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)`,
      [report.id, report.reporterUserId, report.targetType, report.targetType === 'business' ? report.targetId : null, report.targetType === 'professional' ? report.targetId : null, report.reasonCode, report.details, report.status, report.createdAt]
    );
  }

  async listForModeration(): Promise<ModerationProviderReport[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT report_identifier,reporter_user_identifier,target_type,
              COALESCE(business_profile_id,professional_profile_identifier) AS target_id,
              reason_code,details,status,resolution_note,created_at,updated_at
       FROM provider_reports ORDER BY
         CASE status WHEN 'submitted' THEN 0 WHEN 'in_review' THEN 1 ELSE 2 END,
         created_at ASC LIMIT 200`
    );
    return rows.map((row) => ({
      id: String(row.report_identifier), reporterUserId: String(row.reporter_user_identifier),
      targetType: row.target_type as 'business' | 'professional', targetId: String(row.target_id),
      reasonCode: String(row.reason_code), details: String(row.details),
      status: row.status as ModerationProviderReport['status'],
      resolutionNote: row.resolution_note ? String(row.resolution_note) : undefined,
      createdAt: new Date(String(row.created_at)).toISOString(), updatedAt: new Date(String(row.updated_at)).toISOString()
    }));
  }

  async review(id: string, reviewerUserId: string, status: 'in_review' | 'resolved' | 'dismissed', note: string): Promise<boolean> {
    const rows = await this.db.query(
      `UPDATE provider_reports SET status=$2,reviewed_by_user_identifier=$3,resolution_note=$4,updated_at=NOW()
       WHERE report_identifier=$1 AND status IN ('submitted','in_review') RETURNING report_identifier`,
      [id, status, reviewerUserId, note]
    );
    return rows.length === 1;
  }
}
