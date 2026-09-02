import { Inject, Injectable } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { AdminAnalyticsSummary, AnalyticsEventRecord, AnalyticsEventType } from './analytics.types';

@Injectable()
export class AnalyticsRepository {
  constructor(@Inject(DatabasePool) private readonly db: DatabasePool) {}

  async saveEvent(event: AnalyticsEventRecord): Promise<void> {
    await this.db.query(
      `INSERT INTO analytics_events
         (id, event_type, entity_type, entity_id, occurred_at, anonymous_id,
          session_reference, metadata, request_id, correlation_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO NOTHING`,
      [
        event.id, event.eventType, event.entityType, event.entityId,
        event.occurredAt, event.anonymousId ?? null, event.sessionReference ?? null,
        JSON.stringify(event.metadata), event.requestId ?? null,
        event.correlationId ?? null, event.createdAt
      ]
    );
  }

  async findEvent(id: string): Promise<AnalyticsEventRecord | undefined> {
    const rows = await this.db.query<{
      id: string; event_type: string; entity_type: string; entity_id: string;
      occurred_at: Date; anonymous_id: string | null; session_reference: string | null;
      metadata: Record<string, unknown>; request_id: string | null;
      correlation_id: string | null; created_at: Date;
    }>(
      `SELECT id,event_type,entity_type,entity_id,occurred_at,anonymous_id,
              session_reference,metadata,request_id,correlation_id,created_at
       FROM analytics_events WHERE id=$1 LIMIT 1`,
      [id]
    );
    return rows[0] ? this.map(rows[0]) : undefined;
  }

  async listEvents(limit = 100): Promise<AnalyticsEventRecord[]> {
    const rows = await this.db.query<{
      id: string; event_type: string; entity_type: string; entity_id: string;
      occurred_at: Date; anonymous_id: string | null; session_reference: string | null;
      metadata: Record<string, unknown>; request_id: string | null;
      correlation_id: string | null; created_at: Date;
    }>(
      `SELECT id,event_type,entity_type,entity_id,occurred_at,anonymous_id,
              session_reference,metadata,request_id,correlation_id,created_at
       FROM analytics_events ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    return rows.map((r) => this.map(r));
  }

  async adminSummary(periodDays = 30): Promise<AdminAnalyticsSummary> {
    const eventRows = await this.db.query<{ event_type: AnalyticsEventType; count: string }>(
      `SELECT event_type, COUNT(*)::text AS count
       FROM analytics_events
       WHERE occurred_at >= NOW() - ($1::int * INTERVAL '1 day')
       GROUP BY event_type`,
      [periodDays]
    );
    const searchRows = await this.db.query<{ term: string; count: string; unmet_count: string }>(
      `SELECT LOWER(BTRIM(metadata->>'query')) AS term,
              COUNT(*)::text AS count,
              COUNT(*) FILTER (
                WHERE CASE
                  WHEN metadata->>'results_count' ~ '^[0-9]+$'
                    THEN (metadata->>'results_count')::int
                  ELSE 0
                END = 0
              )::text AS unmet_count
       FROM analytics_events
       WHERE event_type='search_action'
         AND occurred_at >= NOW() - ($1::int * INTERVAL '1 day')
         AND LENGTH(BTRIM(COALESCE(metadata->>'query',''))) BETWEEN 2 AND 80
       GROUP BY LOWER(BTRIM(metadata->>'query'))
       HAVING COUNT(*) >= 3
       ORDER BY COUNT(*) DESC, term ASC
       LIMIT 20`,
      [periodDays]
    );
    const eventCounts: Record<AnalyticsEventType, number> = { business_view: 0, search_action: 0, contact_click: 0, inquiry_submitted: 0 };
    for (const row of eventRows) eventCounts[row.event_type] = Number(row.count);
    return {
      periodDays,
      totalEvents: Object.values(eventCounts).reduce((sum, count) => sum + count, 0),
      eventCounts,
      topSearches: searchRows.map((row) => ({ term: row.term, count: Number(row.count) })),
      unmetSearches: searchRows.filter((row) => Number(row.unmet_count) >= 3).map((row) => ({ term: row.term, count: Number(row.unmet_count) }))
    };
  }

  private map(r: {
    id: string; event_type: string; entity_type: string; entity_id: string;
    occurred_at: Date; anonymous_id: string | null; session_reference: string | null;
    metadata: Record<string, unknown>; request_id: string | null;
    correlation_id: string | null; created_at: Date;
  }): AnalyticsEventRecord {
    return {
      id: r.id,
      eventType: r.event_type as AnalyticsEventRecord['eventType'],
      entityType: r.entity_type as AnalyticsEventRecord['entityType'],
      entityId: r.entity_id,
      occurredAt: r.occurred_at.toISOString(),
      anonymousId: r.anonymous_id ?? undefined,
      sessionReference: r.session_reference ?? undefined,
      metadata: r.metadata as AnalyticsEventRecord['metadata'],
      requestId: r.request_id ?? undefined,
      correlationId: r.correlation_id ?? undefined,
      createdAt: r.created_at.toISOString()
    };
  }
}
