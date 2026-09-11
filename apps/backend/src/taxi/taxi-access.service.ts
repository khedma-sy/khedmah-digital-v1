import { ForbiddenException, Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabasePool } from '../database/database.pool';
import { SessionTokenService } from '../identity/security/session-token.service';

export type TaxiAudience = 'customer' | 'driver';
export interface TaxiActor {
  readonly id: string;
  readonly role: TaxiAudience;
  readonly vehicleId?: string;
  readonly zone?: string;
  readonly driverRevision?: string;
  readonly vehicleRevision?: string;
}
interface LockedActorRow extends Record<string, unknown> {
  user_id: string; vehicle_id: string | null; zone_code: string | null;
  driver_revision: string | null; vehicle_revision: string | null;
  valid_until: Date;
}

/** Native session/driver gate for the retained RP30 engine. This is not a dispatch service.
 * Keep authority and future trip writes on the SAME client until commit. */
@Injectable()
export class TaxiAccessService {
  constructor(
    @Inject(DatabasePool) private readonly db: DatabasePool,
    @Inject(SessionTokenService) private readonly tokens: SessionTokenService
  ) {}

  async withActor<T>(sessionToken: string | undefined, audience: TaxiAudience,
    work: (client: PoolClient, actor: TaxiActor) => Promise<T>): Promise<T> {
    // This pass authorizes pre-production acceptance only. No implicit rollout.
    if (process.env.TAXI_ACCESS_ENABLED !== 'true'
      || !['development', 'test', 'preview', 'staging'].includes(process.env.NODE_ENV ?? '')) {
      throw new ServiceUnavailableException('Taxi access is not enabled.');
    }
    if (audience !== 'customer' && audience !== 'driver') throw new ForbiddenException('Taxi role is not supported.');
    // Canonical tokens are 32 random bytes encoded as unpadded base64url.
    if (typeof sessionToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(sessionToken)) {
      throw new UnauthorizedException('Authentication required.');
    }
    try {
      return await this.db.transaction(async (client) => {
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query("SET LOCAL statement_timeout = '15s'");
        const result = await client.query<LockedActorRow>(
          'SELECT * FROM khedmah_taxi.resolve_actor_locked($1, $2)',
          [this.tokens.hashToken(sessionToken), audience === 'driver']);
        const row = result.rows[0];
        if (!row || !(row.valid_until instanceof Date) || !Number.isFinite(row.valid_until.getTime())) {
          throw new UnauthorizedException('Authentication required.');
        }
        if (audience === 'driver' && (!row.vehicle_id || !row.zone_code || !row.driver_revision || !row.vehicle_revision)) {
          throw new ForbiddenException('Approved driver and vehicle are required.');
        }
        const actor: TaxiActor = Object.freeze({ id: row.user_id, role: audience,
          ...(audience === 'driver' ? { vehicleId: row.vehicle_id!, zone: row.zone_code!,
            driverRevision: row.driver_revision!, vehicleRevision: row.vehicle_revision! } : {}) });
        const value = await work(client, actor);
        // Time can expire while the callback runs, even though revocations are locked.
        const fresh = await client.query<{ valid: boolean }>(
          'SELECT pg_catalog.clock_timestamp() < $1::timestamptz AS valid', [row.valid_until.toISOString()]);
        if (fresh.rows[0]?.valid !== true) throw new UnauthorizedException('Authorization expired.');
        return value;
      });
    } catch (error) {
      const code = (error as { code?: unknown })?.code;
      if (code === 'PT401') throw new UnauthorizedException('Authentication required.');
      if (code === 'PT403') throw new ForbiddenException('Approved driver and vehicle are required.');
      if (['3F000', '42883', '42501', '55P03', '57014'].includes(String(code))) {
        // Missing/unapproved schema and lock deadlines must not leak SQL or turn into approval.
        throw new ServiceUnavailableException('Taxi access is temporarily unavailable.');
      }
      throw error;
    }
  }

  access(sessionToken: string | undefined, audience: TaxiAudience): Promise<TaxiActor> {
    return this.withActor(sessionToken, audience, async (_client, actor) => actor);
  }
}
