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

  private parseCount(value: string | undefined): number {
    const parsed = Number(value ?? '0');
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      throw new Error('KORA_METRIC_COUNT_INVALID');
    }
    return parsed;
  }
}
