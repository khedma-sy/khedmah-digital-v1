import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';

type ProfileKind = 'business' | 'professional';
type Decision = { status: 'approved' | 'rejected'; expectedRevision: unknown; reason?: string } | { status: 'pending'; ownerSubmission: true };

// All identifiers are fixed here. Values from requests are bound parameters.
const targets = {
  business: { table: 'business_profiles', id: 'id', owner: 'owner_user_id', lifecycle: 'status' },
  professional: { table: 'professional_profiles', id: 'professional_profile_identifier', owner: 'user_identifier', lifecycle: 'lifecycle_status' }
} as const;
export const PROFILE_REVISION_SQL = `to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

export async function writeProfileReview(db: DatabasePool, kind: ProfileKind, id: string, actorId: string, decision: Decision): Promise<void> {
  if (decision.status !== 'pending') {
    if (typeof decision.expectedRevision !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(decision.expectedRevision)) {
      throw new BadRequestException('expectedRevision must identify the exact profile revision shown to the reviewer.');
    }
    if (decision.status === 'rejected' && (typeof decision.reason !== 'string' || decision.reason.trim().length < 5 || decision.reason.trim().length > 2000)) {
      throw new BadRequestException('A rejection reason between 5 and 2000 characters is required.');
    }
  }
  const target = targets[kind];
  await db.transaction(async (client) => {
    const { rows } = await client.query<{ owner_id: string; moderation_status: string; lifecycle: string; trust_status?: string; revision: string }>(
      `SELECT ${target.owner} AS owner_id, moderation_status, ${target.lifecycle} AS lifecycle,
       ${kind === 'business' ? 'trust_status,' : ''} ${PROFILE_REVISION_SQL} AS revision
       FROM ${target.table} WHERE ${target.id}=$1 FOR UPDATE`, [id]);
    const current = rows[0];
    if (!current) throw new NotFoundException('Profile not found.');
    if (decision.status === 'pending') {
      if (current.owner_id !== actorId) throw new ForbiddenException('Access denied.');
      if (current.moderation_status === 'suspended' || ['suspended','archived'].includes(current.lifecycle) || current.trust_status === 'suspended') {
        throw new ConflictException('A suspended or archived profile requires an administrative decision.');
      }
      if (current.moderation_status === 'pending' && (kind === 'business' || current.lifecycle === 'pending')) return;
    } else {
      if (current.revision !== decision.expectedRevision) throw new ConflictException('The profile changed. Reload the queue before deciding.');
      if (current.moderation_status === 'suspended' || ['suspended','archived'].includes(current.lifecycle) ||
          (decision.status === 'approved' ? current.moderation_status !== 'pending' : !['pending','approved'].includes(current.moderation_status))) {
        throw new ConflictException('This profile is no longer eligible for this review decision.');
      }
    }
    const lifecycle = kind === 'professional' && decision.status !== 'rejected'
      ? `, lifecycle_status='${decision.status === 'approved' ? 'active' : 'pending'}'` : '';
    await client.query(`UPDATE ${target.table} SET moderation_status=$2${lifecycle},
      updated_at=GREATEST(clock_timestamp(),updated_at+interval '1 microsecond') WHERE ${target.id}=$1`, [id,decision.status]);
    await client.query(`INSERT INTO trust_history (id,entity_type,entity_id,old_status,new_status,changed_by,reason,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,clock_timestamp())`, [randomUUID(),kind,id,current.moderation_status,decision.status,actorId,
      decision.status === 'pending' ? 'Submitted for review by owner' : decision.status === 'approved' ? 'Approved by moderator' : decision.reason!.trim()]);
  });
}
