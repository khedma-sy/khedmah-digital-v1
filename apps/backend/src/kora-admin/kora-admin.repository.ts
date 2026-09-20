import { Inject, Injectable } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';

interface CountRow extends Record<string, unknown> {
  readonly count: string;
}

@Injectable()
export class KoraAdminRepository {
  constructor(@Inject(DatabasePool) private readonly db: DatabasePool) {}

  async countUsers(): Promise<number> {
    const rows = await this.db.query<CountRow>('SELECT COUNT(*)::text AS count FROM core_user_accounts');
    return this.parseCount(rows[0]?.count);
  }

  async countSearchActionsSince(since: string): Promise<number> {
    const rows = await this.db.query<CountRow>(
      `SELECT COUNT(*)::text AS count
       FROM analytics_events
       WHERE event_type='search_action' AND occurred_at >= $1`,
      [since]
    );
    return this.parseCount(rows[0]?.count);
  }

  async serviceMetrics(since: string) {
    const [row] = await this.db.query<Record<string,string>>(`SELECT
      (SELECT COUNT(*)::text FROM fulfillment_orders WHERE created_at >= $1) AS fulfillment_orders_24h,
      (SELECT COUNT(*)::text FROM fulfillment_orders WHERE created_at >= $1 AND vertical='food') AS food_orders_24h,
      (SELECT COUNT(*)::text FROM fulfillment_orders WHERE created_at >= $1 AND status='cancelled') AS fulfillment_cancellations_24h,
      (SELECT COUNT(*)::text FROM fulfillment_orders WHERE status='merchant_confirmed') AS delivery_waiting_assignment,
      (SELECT COUNT(*)::text FROM fulfillment_orders WHERE status='merchant_confirmed' AND updated_at < NOW()-INTERVAL '15 minutes') AS delivery_assignment_overdue,
      (SELECT COUNT(*)::text FROM billing_purchase_orders WHERE status='pending') AS billing_pending_orders,
      (SELECT COUNT(*)::text FROM billing_purchase_orders WHERE status='paid' AND paid_at >= $1) AS billing_paid_orders_24h,
      (SELECT COUNT(*)::text FROM ad_listings WHERE status='active' AND (expires_at IS NULL OR expires_at > NOW())) AS ads_active,
      (SELECT COUNT(*)::text FROM ad_listings WHERE status='pending_review') AS ads_pending_review,
      (SELECT COUNT(*)::text FROM ad_listings WHERE status='pending_review' AND submitted_at < NOW()-INTERVAL '24 hours') AS ads_review_overdue_24h,
      (SELECT COUNT(*)::text FROM ad_listings WHERE status='active' AND expires_at IS NOT NULL AND expires_at <= NOW()) AS ads_expired_active,
      (SELECT COUNT(*)::text FROM product_listings WHERE status='active' AND moderation_status='approved') AS store_active_products,
      (SELECT COUNT(*)::text FROM product_listings WHERE status='active' AND moderation_status='pending') AS store_pending_review,
      (SELECT COUNT(*)::text FROM product_listings WHERE status='active' AND moderation_status='pending' AND updated_at < NOW()-INTERVAL '24 hours') AS store_review_overdue_24h,
      (SELECT COUNT(*)::text FROM product_listings WHERE status='active' AND moderation_status='approved' AND availability='out_of_stock') AS store_out_of_stock,
      (SELECT COUNT(*)::text FROM khedmah_taxi.driver_approvals WHERE status='approved' AND expires_at > NOW()) AS taxi_approved_drivers,
      (SELECT COUNT(*)::text FROM khedmah_taxi.driver_approvals WHERE status IN ('suspended','revoked')) AS taxi_restricted_drivers,
      (SELECT COUNT(*)::text FROM khedmah_taxi.driver_approvals WHERE status='approved' AND expires_at > NOW() AND expires_at <= NOW()+INTERVAL '7 days') AS taxi_expiring_approvals_7d,
      (SELECT COUNT(*)::text FROM contact_inquiries WHERE created_at >= $1) AS contact_inquiries_24h,
      (SELECT COUNT(*)::text FROM contact_inquiries WHERE status IN ('submitted','received','read')) AS contact_inquiries_open,
      (SELECT COUNT(*)::text FROM contact_inquiries WHERE status='submitted' AND created_at < NOW()-INTERVAL '24 hours') AS contact_inquiries_unread_24h,
      (SELECT COUNT(*)::text FROM provider_reports WHERE status IN ('submitted','in_review')) AS provider_reports_open,
      (SELECT COUNT(*)::text FROM provider_reports WHERE status IN ('submitted','in_review') AND created_at < NOW()-INTERVAL '24 hours') AS provider_reports_overdue_24h,
      (SELECT COUNT(*)::text FROM provider_reports WHERE status IN ('submitted','in_review') AND reason_code IN ('impersonation','inappropriate_content')) AS provider_reports_sensitive_open,
      (SELECT COUNT(*)::text FROM business_profiles WHERE moderation_status='pending') AS business_profiles_pending_review,
      (SELECT COUNT(*)::text FROM business_profiles WHERE moderation_status='pending' AND updated_at < NOW()-INTERVAL '24 hours') AS business_profiles_review_overdue_24h,
      (SELECT COUNT(*)::text FROM professional_profiles WHERE moderation_status='pending') AS professional_profiles_pending_review,
      (SELECT COUNT(*)::text FROM professional_profiles WHERE moderation_status='pending' AND updated_at < NOW()-INTERVAL '24 hours') AS professional_profiles_review_overdue_24h,
      (SELECT COUNT(*)::text FROM verification_requests WHERE status='pending') AS verification_requests_pending,
      (SELECT COUNT(*)::text FROM verification_requests WHERE status='pending' AND created_at < NOW()-INTERVAL '24 hours') AS verification_requests_overdue_24h,
      (SELECT COUNT(*)::text FROM mobility_document_reviews WHERE status='pending') AS mobility_documents_pending,
      (SELECT COUNT(*)::text FROM mobility_document_reviews WHERE status='pending' AND created_at < NOW()-INTERVAL '24 hours') AS mobility_documents_overdue_24h`, [since]);
    if (!row) throw new Error('KORA_SERVICE_METRICS_MISSING');
    return Object.fromEntries(Object.entries(row).map(([key,value])=>[key,this.parseCount(value)]));
  }

  private parseCount(value: string | undefined): number {
    const parsed = Number(value ?? '0');
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      throw new Error('KORA_METRIC_COUNT_INVALID');
    }
    return parsed;
  }
}
