import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { DatabasePool } from '../database/database.pool';

/** Authorize against the current parent and retain that lock until the child write commits. */
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
  });
}
