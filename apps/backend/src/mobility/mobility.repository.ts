import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabasePool } from '../database/database.pool';
import type { MobilityFarePolicy, MobilityRequest, MobilityRequestStatus, MobilityServiceType } from './mobility.types';

interface MobilityRow extends Record<string, unknown> {
  id: string; rider_user_id: string; provider_business_id: string; provider_owner_user_id: string;
  provider_name: string; provider_phone: string | null; service_type: MobilityRequest['serviceType'];
  pickup_address: string; destination_address: string; rider_contact_phone: string; pickup_latitude: string; pickup_longitude: string;
  destination_latitude: string | null; destination_longitude: string | null; rider_note: string | null;
  status: MobilityRequestStatus; accepted_at: Date | null; en_route_at: Date | null; completed_at: Date | null;
  arrived_at: Date | null; started_at: Date | null; closed_at: Date | null;
  route_distance_meters: number | null; waiting_seconds: number | null; fare_status: MobilityRequest['fareStatus']; fare_currency: 'SYP';
  base_fare: number | null; fare_per_km: number | null; fare_per_waiting_minute: number | null; fare_minimum: number | null; fare_policy_updated_at: Date | null;
  distance_fare: number | null; waiting_fare: number | null; final_fare: number | null;
  created_at: Date; updated_at: Date;
}

interface FarePolicyRow extends Record<string, unknown> {
  service_type: MobilityServiceType; enabled: boolean; currency: 'SYP'; base_fare: number; per_km_fare: number;
  per_waiting_minute_fare: number; minimum_fare: number; approved_at: Date | null; updated_at: Date;
}

export interface MobilityFareTransition {
  readonly baseFare:number; readonly perKmFare:number; readonly perWaitingMinuteFare:number; readonly minimumFare:number; readonly policyUpdatedAt:string;
  readonly distanceMeters?:number; readonly waitingSeconds?:number; readonly distanceFare?:number; readonly waitingFare?:number; readonly finalFare?:number;
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

  async transition(request: MobilityRequest, expected: MobilityRequestStatus, next: MobilityRequestStatus, actorUserId: string, reason?: string, fare?: MobilityFareTransition): Promise<MobilityRequest | undefined> {
    const now = new Date().toISOString();
    const changed = await this.db.transaction(async (client) => {
      const result = await client.query(
        `UPDATE mobility_requests SET status=$3, updated_at=$4,
          accepted_at=CASE WHEN $3='accepted' THEN $4 ELSE accepted_at END,
          en_route_at=CASE WHEN $3='en_route' THEN $4 ELSE en_route_at END,
          arrived_at=CASE WHEN $3='arrived' THEN $4 ELSE arrived_at END,
          started_at=CASE WHEN $3='in_progress' THEN $4 ELSE started_at END,
          completed_at=CASE WHEN $3='completed' THEN $4 ELSE completed_at END,
          closed_at=CASE WHEN $3 IN ('completed','rejected','cancelled') THEN $4 ELSE closed_at END,
          route_distance_meters=CASE WHEN $3='completed' THEN $5 ELSE route_distance_meters END,
          waiting_seconds=CASE WHEN $3='completed' THEN $6 ELSE waiting_seconds END,
          fare_status=CASE WHEN $3='completed' THEN 'finalized' ELSE fare_status END,
          base_fare=CASE WHEN $3 IN ('in_progress','completed') THEN $7 ELSE base_fare END,
          fare_per_km=CASE WHEN $3 IN ('in_progress','completed') THEN $8 ELSE fare_per_km END,
          fare_per_waiting_minute=CASE WHEN $3 IN ('in_progress','completed') THEN $9 ELSE fare_per_waiting_minute END,
          fare_minimum=CASE WHEN $3 IN ('in_progress','completed') THEN $10 ELSE fare_minimum END,
          fare_policy_updated_at=CASE WHEN $3 IN ('in_progress','completed') THEN $11 ELSE fare_policy_updated_at END,
          distance_fare=CASE WHEN $3='completed' THEN $12 ELSE distance_fare END,
          waiting_fare=CASE WHEN $3='completed' THEN $13 ELSE waiting_fare END,
          final_fare=CASE WHEN $3='completed' THEN $14 ELSE final_fare END
         WHERE id=$1 AND status=$2 RETURNING id`,
        [request.id, expected, next, now, fare?.distanceMeters ?? null, fare?.waitingSeconds ?? null, fare?.baseFare ?? null, fare?.perKmFare ?? null,
          fare?.perWaitingMinuteFare ?? null, fare?.minimumFare ?? null, fare?.policyUpdatedAt ?? null, fare?.distanceFare ?? null, fare?.waitingFare ?? null, fare?.finalFare ?? null]
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

  async findFarePolicy(serviceType: MobilityServiceType): Promise<MobilityFarePolicy | undefined> {
    const [row] = await this.db.query<FarePolicyRow>(`SELECT service_type,enabled,currency,base_fare,per_km_fare,per_waiting_minute_fare,minimum_fare,approved_at,updated_at FROM mobility_fare_policies WHERE service_type=$1`,[serviceType]);
    return row ? mapFarePolicy(row) : undefined;
  }

  async saveFarePolicy(input: Omit<MobilityFarePolicy,'currency'|'approvedAt'|'updatedAt'>, actorUserId: string): Promise<MobilityFarePolicy> {
    await this.db.query(`INSERT INTO mobility_fare_policies (service_type,enabled,currency,base_fare,per_km_fare,per_waiting_minute_fare,minimum_fare,approved_by,approved_at,updated_at)
      VALUES ($1,$2,'SYP',$3,$4,$5,$6,CASE WHEN $2 THEN $7 ELSE NULL END,CASE WHEN $2 THEN NOW() ELSE NULL END,NOW())
      ON CONFLICT (service_type) DO UPDATE SET enabled=EXCLUDED.enabled,base_fare=EXCLUDED.base_fare,per_km_fare=EXCLUDED.per_km_fare,per_waiting_minute_fare=EXCLUDED.per_waiting_minute_fare,minimum_fare=EXCLUDED.minimum_fare,approved_by=EXCLUDED.approved_by,approved_at=EXCLUDED.approved_at,updated_at=NOW()`,
      [input.serviceType,input.enabled,input.baseFare,input.perKmFare,input.perWaitingMinuteFare,input.minimumFare,actorUserId]);
    return (await this.findFarePolicy(input.serviceType))!;
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
    acceptedAt: row.accepted_at?.toISOString(), enRouteAt: row.en_route_at?.toISOString(), arrivedAt: row.arrived_at?.toISOString(), startedAt: row.started_at?.toISOString(), completedAt: row.completed_at?.toISOString(),
    routeDistanceMeters: row.route_distance_meters ?? undefined, waitingSeconds: row.waiting_seconds ?? undefined,
    fareStatus: row.fare_status, fareCurrency: row.fare_currency, baseFare: row.base_fare ?? undefined,
    farePerKm: row.fare_per_km ?? undefined, farePerWaitingMinute: row.fare_per_waiting_minute ?? undefined, fareMinimum: row.fare_minimum ?? undefined,
    farePolicyUpdatedAt: row.fare_policy_updated_at?.toISOString(), distanceFare: row.distance_fare ?? undefined,
    waitingFare: row.waiting_fare ?? undefined, finalFare: row.final_fare ?? undefined,
    closedAt: row.closed_at?.toISOString(), createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString()
  };
}

function mapFarePolicy(row: FarePolicyRow): MobilityFarePolicy {
  return { serviceType:row.service_type,enabled:row.enabled,currency:row.currency,baseFare:Number(row.base_fare),perKmFare:Number(row.per_km_fare),perWaitingMinuteFare:Number(row.per_waiting_minute_fare),minimumFare:Number(row.minimum_fare),approvedAt:row.approved_at?.toISOString(),updatedAt:row.updated_at.toISOString() };
}
