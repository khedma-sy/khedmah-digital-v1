import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabasePool } from '../database/database.pool';
import type { MobilityRequest, MobilityRequestStatus } from './mobility.types';

interface MobilityRow extends Record<string, unknown> {
  id: string; rider_user_id: string; provider_business_id: string; provider_owner_user_id: string;
  provider_name: string; provider_phone: string | null; service_type: MobilityRequest['serviceType'];
  pickup_address: string; destination_address: string; rider_contact_phone: string; pickup_latitude: string; pickup_longitude: string;
  destination_latitude: string | null; destination_longitude: string | null; rider_note: string | null;
  status: MobilityRequestStatus; accepted_at: Date | null; en_route_at: Date | null; completed_at: Date | null;
  closed_at: Date | null; created_at: Date; updated_at: Date;
}

const select = `SELECT r.*, b.owner_user_id AS provider_owner_user_id, b.name AS provider_name, b.phone AS provider_phone
  FROM mobility_requests r JOIN business_profiles b ON b.id=r.provider_business_id`;

@Injectable()
export class MobilityRepository {
  constructor(@Inject(DatabasePool) private readonly db: DatabasePool) {}

  async create(request: MobilityRequest, idempotencyKey: string): Promise<MobilityRequest> {
    await this.db.transaction(async (client) => {
      await client.query(
        `INSERT INTO mobility_requests
          (id,rider_user_id,provider_business_id,service_type,pickup_address,destination_address,rider_contact_phone,pickup_latitude,pickup_longitude,destination_latitude,destination_longitude,rider_note,status,idempotency_key,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [request.id, request.riderUserId, request.providerBusinessId, request.serviceType, request.pickupAddress, request.destinationAddress,
          request.riderContactPhone, request.pickupLatitude, request.pickupLongitude, request.destinationLatitude ?? null, request.destinationLongitude ?? null,
          request.riderNote ?? null, request.status, idempotencyKey, request.createdAt, request.updatedAt]
      );
      await client.query(
        `INSERT INTO mobility_request_events (id,request_id,actor_user_id,from_status,to_status,occurred_at) VALUES ($1,$2,$3,NULL,'requested',$4)`,
        [randomUUID(), request.id, request.riderUserId, request.createdAt]
      );
    });
    return (await this.findById(request.id))!;
  }

  async findByRiderIdempotency(riderUserId: string, idempotencyKey: string): Promise<MobilityRequest | undefined> {
    const [row] = await this.db.query<MobilityRow>(`${select} WHERE r.rider_user_id=$1 AND r.idempotency_key=$2 LIMIT 1`, [riderUserId, idempotencyKey]);
    return row ? map(row) : undefined;
  }

  async findById(id: string): Promise<MobilityRequest | undefined> {
    const [row] = await this.db.query<MobilityRow>(`${select} WHERE r.id=$1 LIMIT 1`, [id]);
    return row ? map(row) : undefined;
  }

  async listForRider(riderUserId: string): Promise<MobilityRequest[]> {
    return (await this.db.query<MobilityRow>(`${select} WHERE r.rider_user_id=$1 ORDER BY r.created_at DESC LIMIT 100`, [riderUserId])).map(map);
  }

  async listForProvider(providerBusinessId: string): Promise<MobilityRequest[]> {
    return (await this.db.query<MobilityRow>(`${select} WHERE r.provider_business_id=$1 ORDER BY CASE WHEN r.status='requested' THEN 0 ELSE 1 END, r.created_at DESC LIMIT 100`, [providerBusinessId])).map(map);
  }

  async transition(request: MobilityRequest, expected: MobilityRequestStatus, next: MobilityRequestStatus, actorUserId: string, reason?: string): Promise<MobilityRequest | undefined> {
    const now = new Date().toISOString();
    const changed = await this.db.transaction(async (client) => {
      const result = await client.query(
        `UPDATE mobility_requests SET status=$3, updated_at=$4,
          accepted_at=CASE WHEN $3='accepted' THEN $4 ELSE accepted_at END,
          en_route_at=CASE WHEN $3='en_route' THEN $4 ELSE en_route_at END,
          completed_at=CASE WHEN $3='completed' THEN $4 ELSE completed_at END,
          closed_at=CASE WHEN $3 IN ('completed','rejected','cancelled') THEN $4 ELSE closed_at END
         WHERE id=$1 AND status=$2 RETURNING id`,
        [request.id, expected, next, now]
      );
      if (!result.rowCount) return false;
      await client.query(
        `INSERT INTO mobility_request_events (id,request_id,actor_user_id,from_status,to_status,reason,occurred_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [randomUUID(), request.id, actorUserId, expected, next, reason ?? null, now]
      );
      return true;
    });
    return changed ? this.findById(request.id) : undefined;
  }
}

function map(row: MobilityRow): MobilityRequest {
  return {
    id: row.id, riderUserId: row.rider_user_id, providerBusinessId: row.provider_business_id,
    providerOwnerUserId: row.provider_owner_user_id, providerName: row.provider_name, providerPhone: row.provider_phone ?? undefined,
    serviceType: row.service_type, pickupAddress: row.pickup_address, destinationAddress: row.destination_address, riderContactPhone: row.rider_contact_phone,
    pickupLatitude: Number(row.pickup_latitude), pickupLongitude: Number(row.pickup_longitude),
    destinationLatitude: row.destination_latitude === null ? undefined : Number(row.destination_latitude),
    destinationLongitude: row.destination_longitude === null ? undefined : Number(row.destination_longitude),
    riderNote: row.rider_note ?? undefined, status: row.status,
    acceptedAt: row.accepted_at?.toISOString(), enRouteAt: row.en_route_at?.toISOString(), completedAt: row.completed_at?.toISOString(),
    closedAt: row.closed_at?.toISOString(), createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString()
  };
}
