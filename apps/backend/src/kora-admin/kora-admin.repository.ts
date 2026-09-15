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
      (SELECT COUNT(*)::text FROM billing_purchase_orders WHERE status='paid' AND paid_at >= $1) AS billing_paid_orders_24h`, [since]);
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
