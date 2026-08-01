import { Inject, Injectable } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { AnalyticsEventRecord } from './analytics.types';

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
