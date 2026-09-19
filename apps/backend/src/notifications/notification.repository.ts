import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabasePool } from '../database/database.pool';
import type { PlatformNotification, PublishNotification } from './notification.types';

interface NotificationRow extends Record<string, unknown> {
  id: string; event_type: PlatformNotification['eventType']; reference_type: PlatformNotification['referenceType'];
  reference_id: string; title: string; body: string; metadata: Record<string, string>;
  read_at: Date | null; created_at: Date;
}

@Injectable()
export class NotificationRepository {
  constructor(@Inject(DatabasePool) private readonly db: DatabasePool) {}

  async publish(input: PublishNotification): Promise<void> {
    await this.db.query(
      `INSERT INTO platform_notifications (id,user_id,event_key,event_type,reference_type,reference_id,title,body,metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
       ON CONFLICT (user_id,event_key) DO NOTHING`,
      [randomUUID(), input.userId, input.eventKey, input.eventType, input.referenceType, input.referenceId,
        input.title, input.body, JSON.stringify(input.metadata ?? {})]
    );
  }

  async list(userId: string, limit: number): Promise<PlatformNotification[]> {
    const rows = await this.db.query<NotificationRow>(
      `SELECT id,event_type,reference_type,reference_id,title,body,metadata,read_at,created_at
       FROM platform_notifications WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2`,
      [userId, limit]
    );
    return rows.map(mapRow);
  }

  async unreadCount(userId: string): Promise<number> {
    const [row] = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::text count FROM platform_notifications WHERE user_id=$1 AND read_at IS NULL`, [userId]
    );
    return Number(row?.count ?? 0);
  }

  async markRead(userId: string, id: string): Promise<boolean> {
    const rows = await this.db.query<{ id: string }>(
      `UPDATE platform_notifications SET read_at=COALESCE(read_at,NOW()) WHERE id=$1 AND user_id=$2 RETURNING id`, [id, userId]
    );
    return rows.length === 1;
  }

  async markAllRead(userId: string): Promise<number> {
    const rows = await this.db.query<{ id: string }>(
      `UPDATE platform_notifications SET read_at=NOW() WHERE user_id=$1 AND read_at IS NULL RETURNING id`, [userId]
    );
    return rows.length;
  }
}

function mapRow(row: NotificationRow): PlatformNotification {
  return { id: row.id, eventType: row.event_type, referenceType: row.reference_type, referenceId: row.reference_id,
    title: row.title, body: row.body, metadata: row.metadata ?? {}, readAt: row.read_at?.toISOString(), createdAt: row.created_at.toISOString() };
}
