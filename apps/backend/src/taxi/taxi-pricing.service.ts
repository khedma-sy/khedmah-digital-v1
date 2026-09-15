import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { IdentityRepository } from '../identity/identity.repository';
import { IdentityService } from '../identity/identity.service';

export const NEW_SYRIAN_POUND_CODE = 'SYP' as const;
export const NEW_SYRIAN_POUND_ERA = 'SYP_NEW_2026' as const;
const MAX_MINOR = 100_000_000;
const MAX_MULTIPLIER_BPS = 20_000;

export interface TaxiPricingConfig {
  openingFareMinor: number;
  perKmMinor: number;
  waitPerMinuteMinor: number;
  bookingFeeMinor: number;
  minimumFareMinor: number;
  demandMultiplierBps: number;
  maxAmountMinor: number;
  quoteTtlMs: number;
}

export interface TaxiPricingCompiled {
  currency: typeof NEW_SYRIAN_POUND_CODE;
  currencyEra: typeof NEW_SYRIAN_POUND_ERA;
  taxiBaseMinor: number;
  taxiPerKmMinor: number;
  taxiWaitPerMinuteMinor: number;
  taxiMinimumMinor: number;
  maxAmountMinor: number;
  quoteTtlMs: number;
}

interface TaxiPricingRow extends Record<string, unknown> {
  id: string;
  zone_code: string;
  revision: string | number;
  currency: string;
  currency_era: string;
  opening_fare_minor: string | number;
  per_km_minor: string | number;
  wait_per_minute_minor: string | number;
  booking_fee_minor: string | number;
  minimum_fare_minor: string | number;
  demand_multiplier_bps: string | number;
  effective_base_minor: string | number;
  effective_per_km_minor: string | number;
  effective_wait_per_minute_minor: string | number;
  max_amount_minor: string | number;
  quote_ttl_ms: string | number;
  reason: string;
  created_by: string;
  activated_at: Date;
  created_at: Date;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Pricing payload is invalid.');
  return value as Record<string, unknown>;
}

function integer(value: unknown, field: string, min = 0, max = MAX_MINOR): number {
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) {
    throw new BadRequestException(`${field} is invalid.`);
  }
  return Number(value);
}

function text(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== 'string') throw new BadRequestException(`${field} is invalid.`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) throw new BadRequestException(`${field} is invalid.`);
  return normalized;
}

export function validateTaxiPricingConfig(value: unknown): TaxiPricingConfig {
  const body = object(value);
  const config: TaxiPricingConfig = {
    openingFareMinor: integer(body.openingFareMinor, 'openingFareMinor'),
    perKmMinor: integer(body.perKmMinor, 'perKmMinor'),
    waitPerMinuteMinor: integer(body.waitPerMinuteMinor, 'waitPerMinuteMinor'),
    bookingFeeMinor: integer(body.bookingFeeMinor ?? 0, 'bookingFeeMinor'),
    minimumFareMinor: integer(body.minimumFareMinor, 'minimumFareMinor'),
    demandMultiplierBps: integer(body.demandMultiplierBps ?? 10_000, 'demandMultiplierBps', 10_000, MAX_MULTIPLIER_BPS),
    maxAmountMinor: integer(body.maxAmountMinor, 'maxAmountMinor', 1, MAX_MINOR),
    quoteTtlMs: integer(body.quoteTtlMs, 'quoteTtlMs', 30_000, 900_000)
  };
  for (const [field, amount] of Object.entries(config)) {
    if (field === 'demandMultiplierBps' || field === 'quoteTtlMs' || field === 'maxAmountMinor') continue;
    if (amount > config.maxAmountMinor) throw new BadRequestException(`${field} exceeds maxAmountMinor.`);
  }
  return config;
}

function scaleMinor(value: number, multiplierBps: number): number {
  const scaled = (BigInt(value) * BigInt(multiplierBps) + 9_999n) / 10_000n;
  if (scaled > BigInt(Number.MAX_SAFE_INTEGER)) throw new BadRequestException('Pricing amount is too large.');
  return Number(scaled);
}

export function compileNewSyrianTaxiPricing(config: TaxiPricingConfig): TaxiPricingCompiled {
  const openingAfterDemand = scaleMinor(config.openingFareMinor, config.demandMultiplierBps);
  const taxiBaseMinor = openingAfterDemand + config.bookingFeeMinor;
  const taxiPerKmMinor = scaleMinor(config.perKmMinor, config.demandMultiplierBps);
  const taxiWaitPerMinuteMinor = scaleMinor(config.waitPerMinuteMinor, config.demandMultiplierBps);
  for (const value of [taxiBaseMinor, taxiPerKmMinor, taxiWaitPerMinuteMinor, config.minimumFareMinor]) {
    if (!Number.isSafeInteger(value) || value < 0 || value > config.maxAmountMinor) {
      throw new BadRequestException('Effective Taxi pricing exceeds maxAmountMinor.');
    }
  }
  return {
    currency: NEW_SYRIAN_POUND_CODE,
    currencyEra: NEW_SYRIAN_POUND_ERA,
    taxiBaseMinor,
    taxiPerKmMinor,
    taxiWaitPerMinuteMinor,
    taxiMinimumMinor: config.minimumFareMinor,
    maxAmountMinor: config.maxAmountMinor,
    quoteTtlMs: config.quoteTtlMs
  };
}

function ceilRatio(value: bigint, divisor: bigint): bigint {
  return (value + divisor - 1n) / divisor;
}

export function simulateNewSyrianTaxiFare(config: TaxiPricingConfig, distanceMeters: number, waitSeconds: number) {
  integer(distanceMeters, 'distanceMeters', 0, 500_000);
  integer(waitSeconds, 'waitSeconds', 0, 86_400);
  const effective = compileNewSyrianTaxiPricing(config);
  const openingAfterDemandMinor = scaleMinor(config.openingFareMinor, config.demandMultiplierBps);
  const distanceMinor = Number(ceilRatio(BigInt(distanceMeters) * BigInt(effective.taxiPerKmMinor), 1_000n));
  const waitingMinor = Number(ceilRatio(BigInt(waitSeconds) * BigInt(effective.taxiWaitPerMinuteMinor), 60n));
  const meteredMinor = effective.taxiBaseMinor + distanceMinor + waitingMinor;
  const totalMinor = Math.max(meteredMinor, effective.taxiMinimumMinor);
  if (totalMinor > effective.maxAmountMinor) throw new BadRequestException('Simulated fare exceeds maxAmountMinor.');
  return {
    currency: NEW_SYRIAN_POUND_CODE,
    currencyEra: NEW_SYRIAN_POUND_ERA,
    demandMultiplierBps: config.demandMultiplierBps,
    openingAfterDemandMinor,
    bookingFeeMinor: config.bookingFeeMinor,
    distanceMinor,
    waitingMinor,
    minimumAdjustmentMinor: Math.max(0, effective.taxiMinimumMinor - meteredMinor),
    totalMinor,
    effective
  };
}

function mapRow(row: TaxiPricingRow) {
  return {
    id: row.id,
    zoneCode: row.zone_code,
    revision: Number(row.revision),
    currency: NEW_SYRIAN_POUND_CODE,
    currencyEra: NEW_SYRIAN_POUND_ERA,
    openingFareMinor: Number(row.opening_fare_minor),
    perKmMinor: Number(row.per_km_minor),
    waitPerMinuteMinor: Number(row.wait_per_minute_minor),
    bookingFeeMinor: Number(row.booking_fee_minor),
    minimumFareMinor: Number(row.minimum_fare_minor),
    demandMultiplierBps: Number(row.demand_multiplier_bps),
    effectiveBaseMinor: Number(row.effective_base_minor),
    effectivePerKmMinor: Number(row.effective_per_km_minor),
    effectiveWaitPerMinuteMinor: Number(row.effective_wait_per_minute_minor),
    maxAmountMinor: Number(row.max_amount_minor),
    quoteTtlMs: Number(row.quote_ttl_ms),
    reason: row.reason,
    createdBy: row.created_by,
    activatedAt: row.activated_at.toISOString(),
    createdAt: row.created_at.toISOString()
  };
}

@Injectable()
export class TaxiPricingAdminService {
  constructor(
    @Inject(DatabasePool) private readonly db: DatabasePool,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(IdentityRepository) private readonly identities: IdentityRepository
  ) {}

  private zone(value: unknown): string {
    const zone = text(value, 'zoneCode', 1, 50);
    if (!/^[A-Za-z0-9_-]+$/.test(zone)) throw new BadRequestException('zoneCode is invalid.');
    return zone;
  }

  private async requireAdmin(sessionToken: string | undefined): Promise<string> {
    const user = await this.identity.getCurrentUser(sessionToken);
    const roles = await this.identities.findAdminRoles(user.id);
    if (!roles.some((role) => role === 'bootstrap_admin' || role === 'taxi_pricing_admin')) {
      throw new ForbiddenException('Taxi pricing administration access denied.');
    }
    return user.id;
  }

  async current(sessionToken: string | undefined, zoneValue: unknown) {
    await this.requireAdmin(sessionToken);
    const zone = this.zone(zoneValue);
    const history = await this.db.query<TaxiPricingRow>(
      `SELECT * FROM taxi_pricing_revisions WHERE zone_code=$1 ORDER BY revision DESC LIMIT 1`,
      [zone]
    );
    const schema = await this.db.query<{ exists: boolean } & Record<string, unknown>>(
      `SELECT to_regclass('khedmah_taxi.tariffs') IS NOT NULL AS exists`
    );
    if (!schema[0]?.exists) return { zoneCode: zone, revision: history[0] ? mapRow(history[0]) : null, activeRevision: null, synchronized: false };
    const active = await this.db.query<{ revision: string; currency_era: string | null } & Record<string, unknown>>(
      `SELECT revision::text, payload->>'currencyEra' AS currency_era FROM khedmah_taxi.tariffs WHERE zone_code=$1 LIMIT 1`,
      [zone]
    );
    const latest = history[0] ? mapRow(history[0]) : null;
    return {
      zoneCode: zone,
      revision: latest,
      activeRevision: active[0] ? Number(active[0].revision) : null,
      synchronized: !!latest && Number(active[0]?.revision) === latest.revision && active[0]?.currency_era === NEW_SYRIAN_POUND_ERA
    };
  }

  async history(sessionToken: string | undefined, zoneValue: unknown) {
    await this.requireAdmin(sessionToken);
    const zone = this.zone(zoneValue);
    const rows = await this.db.query<TaxiPricingRow>(
      `SELECT * FROM taxi_pricing_revisions WHERE zone_code=$1 ORDER BY revision DESC LIMIT 100`,
      [zone]
    );
    return { zoneCode: zone, revisions: rows.map(mapRow) };
  }

  async simulate(sessionToken: string | undefined, value: unknown) {
    await this.requireAdmin(sessionToken);
    const body = object(value);
    return simulateNewSyrianTaxiFare(
      validateTaxiPricingConfig(body),
      integer(body.distanceMeters, 'distanceMeters', 0, 500_000),
      integer(body.waitSeconds ?? 0, 'waitSeconds', 0, 86_400)
    );
  }

  async replaceActive(sessionToken: string | undefined, value: unknown) {
    const actorId = await this.requireAdmin(sessionToken);
    const body = object(value);
    const zone = this.zone(body.zoneCode);
    const reason = text(body.reason, 'reason', 5, 300);
    const expectedRevision = integer(body.expectedRevision, 'expectedRevision', 0, Number.MAX_SAFE_INTEGER);
    if (body.currency !== undefined && body.currency !== NEW_SYRIAN_POUND_CODE) {
      throw new BadRequestException('Taxi pricing currency is fixed to the new Syrian pound (SYP).');
    }
    const config = validateTaxiPricingConfig(body);
    const effective = compileNewSyrianTaxiPricing(config);
    const result = await this.db.transaction(async (client) => {
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [`taxi-pricing:${zone}`]);
      const schema = await client.query<{ exists: boolean }>(
        `SELECT to_regclass('khedmah_taxi.tariffs') IS NOT NULL AS exists`
      );
      if (!schema.rows[0]?.exists) throw new ServiceUnavailableException('Taxi runtime tariff storage is unavailable.');
      const active = await client.query<{ revision: string }>(
        `SELECT revision::text FROM khedmah_taxi.tariffs WHERE zone_code=$1 FOR UPDATE`,
        [zone]
      );
      const latest = await client.query<{ revision: string }>(
        `SELECT revision::text FROM taxi_pricing_revisions WHERE zone_code=$1 ORDER BY revision DESC LIMIT 1`,
        [zone]
      );
      const activeRevision = Number(active.rows[0]?.revision ?? 0);
      const historyRevision = Number(latest.rows[0]?.revision ?? 0);
      if (!Number.isSafeInteger(activeRevision) || !Number.isSafeInteger(historyRevision)) {
        throw new ServiceUnavailableException('Taxi pricing revision state is invalid.');
      }
      if (Math.max(activeRevision, historyRevision) !== expectedRevision) {
        throw new ConflictException('Taxi pricing changed. Refresh the current revision before saving.');
      }
      const revision = Math.max(activeRevision, historyRevision) + 1;
      if (!Number.isSafeInteger(revision) || revision < 1) throw new ConflictException('Taxi pricing revision overflow.');
      const id = randomUUID();
      const inserted = await client.query<TaxiPricingRow>(
        `INSERT INTO taxi_pricing_revisions(
           id,zone_code,revision,currency,currency_era,opening_fare_minor,per_km_minor,wait_per_minute_minor,
           booking_fee_minor,minimum_fare_minor,demand_multiplier_bps,effective_base_minor,effective_per_km_minor,
           effective_wait_per_minute_minor,max_amount_minor,quote_ttl_ms,reason,created_by,activated_at,created_at
         ) VALUES($1,$2,$3,'SYP','SYP_NEW_2026',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW(),NOW())
         RETURNING *`,
        [id, zone, revision, config.openingFareMinor, config.perKmMinor, config.waitPerMinuteMinor,
          config.bookingFeeMinor, config.minimumFareMinor, config.demandMultiplierBps, effective.taxiBaseMinor,
          effective.taxiPerKmMinor, effective.taxiWaitPerMinuteMinor, config.maxAmountMinor, config.quoteTtlMs, reason, actorId]
      );
      const payload = {
        currency: NEW_SYRIAN_POUND_CODE,
        currencyEra: NEW_SYRIAN_POUND_ERA,
        quoteTtlMs: config.quoteTtlMs,
        taxiBaseMinor: effective.taxiBaseMinor,
        taxiPerKmMinor: effective.taxiPerKmMinor,
        taxiWaitPerMinuteMinor: effective.taxiWaitPerMinuteMinor,
        taxiMinimumMinor: effective.taxiMinimumMinor,
        maxAmountMinor: effective.maxAmountMinor,
        pricingRevisionId: id,
        pricingMeta: {
          openingFareMinor: config.openingFareMinor,
          perKmMinor: config.perKmMinor,
          waitPerMinuteMinor: config.waitPerMinuteMinor,
          bookingFeeMinor: config.bookingFeeMinor,
          demandMultiplierBps: config.demandMultiplierBps
        }
      };
      await client.query(
        `INSERT INTO khedmah_taxi.tariffs(zone_code,revision,payload,enabled,valid_from,valid_until)
         VALUES($1,$2,$3,true,clock_timestamp(),clock_timestamp()+interval '10 years')
         ON CONFLICT(zone_code) DO UPDATE SET
           revision=EXCLUDED.revision,payload=EXCLUDED.payload,enabled=true,
           valid_from=EXCLUDED.valid_from,valid_until=EXCLUDED.valid_until`,
        [zone, revision, JSON.stringify(payload)]
      );
      return mapRow(inserted.rows[0]);
    });
    return { pricing: result, effective };
  }
}
