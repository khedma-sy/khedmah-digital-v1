import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ServiceUnavailableException } from '@nestjs/common';
import { TaxiTripService } from './taxi-trip.service';

function fixture(rowsByAudience: Record<'customer'|'driver', { id: string }[]>) {
  const calls: { audience: string; sql: string; params?: unknown[] }[] = [];
  let currentAudience: 'customer'|'driver' = 'customer';
  const pg = {
    async query(sql: string, params?: unknown[]) {
      calls.push({ audience: currentAudience, sql, params });
      if (sql.startsWith('SET LOCAL')) return { rows: [], rowCount: 0 };
      if (sql.includes('SELECT id FROM jt_orders')) return { rows: rowsByAudience[currentAudience], rowCount: rowsByAudience[currentAudience].length };
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };
  const access = {
    async withActor<T>(_token: string | undefined, audience: 'customer'|'driver', work: (client: typeof pg, actor: { id: string; role: 'customer'|'driver' }) => Promise<T>) {
      currentAudience = audience;
      return work(pg, { id: audience === 'customer' ? 'rider-one' : 'driver-one', role: audience });
    }
  };
  return { service: new TaxiTripService(access as any), calls };
}

test('active rider and driver recovery derive ownership from the authenticated actor only', async () => {
  const oldEnabled = process.env.TAXI_TRIPS_ENABLED, oldZone = process.env.TAXI_OPERATING_ZONE;
  process.env.TAXI_TRIPS_ENABLED = 'true'; process.env.TAXI_OPERATING_ZONE = 'test-zone';
  try {
    const f = fixture({ customer: [{ id: 'trip-rider' }], driver: [{ id: 'trip-driver' }] });
    assert.deepEqual(await f.service.active('session-rider', 'customer'), { tripId: 'trip-rider' });
    assert.deepEqual(await f.service.active('session-driver', 'driver'), { tripId: 'trip-driver' });
    const reads = f.calls.filter(call => call.sql.includes('SELECT id FROM jt_orders'));
    assert.match(reads[0].sql, /customer_id=\$1/); assert.deepEqual(reads[0].params, ['rider-one']);
    assert.match(reads[1].sql, /provider_id=\$1/); assert.deepEqual(reads[1].params, ['driver-one']);
    assert.doesNotMatch(reads.map(call => call.sql).join('\n'), /customer_id=\$2|provider_id=\$2/);
  } finally {
    if (oldEnabled === undefined) delete process.env.TAXI_TRIPS_ENABLED; else process.env.TAXI_TRIPS_ENABLED = oldEnabled;
    if (oldZone === undefined) delete process.env.TAXI_OPERATING_ZONE; else process.env.TAXI_OPERATING_ZONE = oldZone;
  }
});

test('active recovery returns null when the account has no active trip', async () => {
  const oldEnabled = process.env.TAXI_TRIPS_ENABLED, oldZone = process.env.TAXI_OPERATING_ZONE;
  process.env.TAXI_TRIPS_ENABLED = 'true'; process.env.TAXI_OPERATING_ZONE = 'test-zone';
  try {
    const f = fixture({ customer: [], driver: [] });
    assert.deepEqual(await f.service.active('session', 'customer'), { tripId: null });
    assert.deepEqual(await f.service.active('session', 'driver'), { tripId: null });
  } finally {
    if (oldEnabled === undefined) delete process.env.TAXI_TRIPS_ENABLED; else process.env.TAXI_TRIPS_ENABLED = oldEnabled;
    if (oldZone === undefined) delete process.env.TAXI_OPERATING_ZONE; else process.env.TAXI_OPERATING_ZONE = oldZone;
  }
});

test('multiple active rows fail closed instead of choosing an arbitrary trip', async () => {
  const oldEnabled = process.env.TAXI_TRIPS_ENABLED, oldZone = process.env.TAXI_OPERATING_ZONE;
  process.env.TAXI_TRIPS_ENABLED = 'true'; process.env.TAXI_OPERATING_ZONE = 'test-zone';
  try {
    const f = fixture({ customer: [{ id: 'a' }, { id: 'b' }], driver: [] });
    await assert.rejects(f.service.active('session', 'customer'), ServiceUnavailableException);
  } finally {
    if (oldEnabled === undefined) delete process.env.TAXI_TRIPS_ENABLED; else process.env.TAXI_TRIPS_ENABLED = oldEnabled;
    if (oldZone === undefined) delete process.env.TAXI_OPERATING_ZONE; else process.env.TAXI_OPERATING_ZONE = oldZone;
  }
});
