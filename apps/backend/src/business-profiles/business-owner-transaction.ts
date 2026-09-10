import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { DatabasePool } from '../database/database.pool';

/**
 * Authorize against the current parent and retain that lock until the child write commits.
 * Any successful owner-visible child mutation invalidates a non-suspended moderation snapshot
 * and advances the parent revision in the same transaction. This keeps reviewer decisions
 * fail-closed when hours, branches, or social links change after the queue was loaded.
 */
export async function withBusinessOwnerWrite(
  db: DatabasePool,
  businessProfileId: string,
  actorId: string,
  write: (client: PoolClient) => Promise<void>
): Promise<void> {
  await db.transaction(async (client) => {
    // A preflight service read is not authority for a later write. In READ COMMITTED,
    // this statement waits for any transfer/delete and then sees its committed result.
    const parent = await client.query<{ owner_user_id: string }>(
      `SELECT owner_user_id FROM business_profiles WHERE id=$1 FOR UPDATE`,
      [businessProfileId]
    );
    if (!parent.rows[0]) throw new NotFoundException('Business profile not found.');
    if (parent.rows[0].owner_user_id !== actorId) throw new ForbiddenException('Access denied.');

    await write(client);

    // Child content is part of what a reviewer/public user sees. Advance the parent revision
    // and require a fresh review, while never undoing an administrative suspension.
    await client.query(
      `UPDATE business_profiles
       SET moderation_status = CASE WHEN moderation_status='suspended' THEN 'suspended' ELSE 'pending' END,
           updated_at = GREATEST(clock_timestamp(), updated_at + interval '1 microsecond')
       WHERE id=$1`,
      [businessProfileId]
    );
  });
}
