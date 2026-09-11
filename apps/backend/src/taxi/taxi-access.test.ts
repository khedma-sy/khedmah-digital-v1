import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { ForbiddenException, Module, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { PoolClient } from 'pg';
import { DatabasePool } from '../database/database.pool';
import { createTestPool, resetCanonicalTestSchema } from '../database/test-pool';
import { IdentityRepository } from '../identity/identity.repository';
import { SessionTokenService } from '../identity/security/session-token.service';
import { TaxiAccessController } from './taxi-access.controller';
import { TaxiAccessService } from './taxi-access.service';

// No production database, enrollment, SMS, GPS or trip is used. The canonical
// accounts/sessions, PostgreSQL locks, restricted runtime and HTTP are real.
test('native Taxi access uses canonical sessions and independent driver/vehicle approval', { timeout: 90_000 }, async t => {
  const saved = { mode: process.env.NODE_ENV, flag: process.env.TAXI_ACCESS_ENABLED };
  process.env.NODE_ENV = 'test'; process.env.TAXI_ACCESS_ENABLED = 'true';
  const pool = createTestPool(), db = DatabasePool.fromPool(pool), identity = new IdentityRepository(db);
  const tokens = new SessionTokenService(), token = tokens.createToken(), strangerToken = tokens.createToken();
  const user = randomUUID(), reviewer = randomUUID(), stranger = randomUUID();
  const role = `taxi_test_${randomUUID().replaceAll('-', '')}`;
  const marker = `taxi_access_effect_${randomUUID().replaceAll('-', '')}`;
  let createdRole = false, createdSchema = false, createdMarker = false;
  let writerPid: number | undefined;
  const runtimeDb = {
    transaction: <T>(work: (client: PoolClient) => Promise<T>): Promise<T> => db.transaction(async client => {
      await client.query(`SET LOCAL ROLE "${role}"`);
      writerPid = (await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      return work(client);
    })
  } as DatabasePool;
  const access = new TaxiAccessService(runtimeDb, tokens);
  const count = async () => Number((await pool.query(`SELECT count(*) AS n FROM public."${marker}"`)).rows[0].n);
  async function reset() {
    await pool.query(`TRUNCATE public."${marker}"`);
    await pool.query(`UPDATE public.identity_sessions SET revoked_at=NULL,expires_at=clock_timestamp()+interval '5 minutes' WHERE user_identifier=$1`, [user]);
    await pool.query(`UPDATE public.core_user_accounts SET account_status='active',lifecycle_status='active' WHERE user_identifier=$1`, [user]);
    await pool.query(`UPDATE public.profiles SET lifecycle_status='active' WHERE user_identifier=$1`, [user]);
    await pool.query(`UPDATE khedmah_taxi.driver_approvals SET status='approved',approved_at=clock_timestamp()-interval '1 day',expires_at=clock_timestamp()+interval '5 minutes' WHERE user_id=$1`, [user]);
    await pool.query(`UPDATE khedmah_taxi.vehicle_approvals SET status='approved',driver_user_id=$1,approved_at=clock_timestamp()-interval '1 day',expires_at=clock_timestamp()+interval '5 minutes' WHERE id='test-vehicle'`, [user]);
  }
  async function until(check: () => Promise<boolean>, reason: string) {
    const deadline = Date.now() + 4000;
    do { if (await check()) return; await delay(10); } while (Date.now() < deadline);
    assert.fail(reason);
  }
  try {
    await resetCanonicalTestSchema(pool);
    await pool.query(`CREATE ROLE "${role}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`); createdRole = true;
    await pool.query(await readFile(resolve(__dirname, 'sql/access.candidate.sql'), 'utf8')); createdSchema = true;
    await pool.query(`CREATE TABLE public."${marker}"(actor_id TEXT, executor TEXT)`); createdMarker = true;
    await pool.query(`GRANT USAGE ON SCHEMA public,khedmah_taxi TO "${role}"`);
    await pool.query(`GRANT EXECUTE ON FUNCTION khedmah_taxi.resolve_actor_locked(TEXT,BOOLEAN) TO "${role}"`);
    await pool.query(`GRANT INSERT ON public."${marker}" TO "${role}"`);
    const now = new Date().toISOString();
    for (const id of [user, reviewer, stranger]) {
      await identity.saveAccount({ id, email: `${id}@example.test`, passwordHash: 'nonlogin-test-hash', status: 'active', createdAt: now, updatedAt: now });
      await identity.saveProfile({ userId: id, displayName: 'Disposable Taxi acceptance', locale: 'ar', createdAt: now, updatedAt: now });
    }
    for (const [userId, raw] of [[user, token], [stranger, strangerToken]]) {
      await identity.saveSession({ id: randomUUID(), userId, tokenHash: tokens.hashToken(raw), createdAt: now, expiresAt: tokens.expiresAt() });
    }
    await pool.query(`INSERT INTO khedmah_taxi.vehicle_approvals VALUES('test-vehicle',$1,'approved',$2,'test-only-registration-proof',clock_timestamp()-interval '1 day',clock_timestamp()+interval '5 minutes',1)`, [user, reviewer]);
    await pool.query(`INSERT INTO khedmah_taxi.driver_approvals VALUES($1,'test-vehicle','test-zone','approved',$2,'test-only-identity-and-license-proof',clock_timestamp()-interval '1 day',clock_timestamp()+interval '5 minutes',1)`, [user, reviewer]);

    await t.test('the canonical session resolves a rider without promoting them to driver', async () => {
      assert.deepEqual(await access.access(token, 'customer'), { id: user, role: 'customer' });
      assert.deepEqual(await access.access(strangerToken, 'customer'), { id: stranger, role: 'customer' });
    });
    await t.test('driver access is a redacted, immutable current approval snapshot', async () => {
      const actor = await access.access(token, 'driver');
      assert.deepEqual(actor, { id: user, role: 'driver', vehicleId: 'test-vehicle', zone: 'test-zone', driverRevision: '1', vehicleRevision: '1' });
      assert.equal(Object.isFrozen(actor), true);
      assert.doesNotMatch(JSON.stringify(actor), /proof|registration|license|token|email/);
    });
    await t.test('an active account is not a driving approval', async () => {
      await assert.rejects(access.access(strangerToken, 'driver'), ForbiddenException);
    });
    for (const invalid of [undefined, '', 'malformed', 'x'.repeat(44), '%'.repeat(43), tokens.createToken()]) {
      await t.test(`invalid or unknown session is unauthorized (${invalid?.length ?? 'absent'})`, async () => {
        await assert.rejects(access.access(invalid, 'customer'), UnauthorizedException);
      });
    }
    await t.test('client-selected unsupported roles cannot authorize settlement or administration', async () => {
      await assert.rejects(access.access(token, 'operator' as any), ForbiddenException);
    });
    for (const [mode, flag] of [['test', undefined], ['test', 'TRUE'], ['production', 'true'], ['', 'true']]) {
      await t.test(`disabled and production gates are closed (mode=${mode}, flag=${flag})`, async () => {
        process.env.NODE_ENV = mode;
        if (flag === undefined) delete process.env.TAXI_ACCESS_ENABLED; else process.env.TAXI_ACCESS_ENABLED = flag;
        try { await assert.rejects(access.access(token, 'customer'), ServiceUnavailableException); }
        finally { process.env.NODE_ENV = 'test'; process.env.TAXI_ACCESS_ENABLED = 'true'; }
      });
    }
    for (const [name, sql, parameters, error] of [
      ['revoked session', 'UPDATE public.identity_sessions SET revoked_at=clock_timestamp() WHERE user_identifier=$1', [user], UnauthorizedException],
      ['suspended account', "UPDATE public.core_user_accounts SET account_status='suspended' WHERE user_identifier=$1", [user], UnauthorizedException],
      ['suspended profile', "UPDATE public.profiles SET lifecycle_status='suspended' WHERE user_identifier=$1", [user], UnauthorizedException],
      ['pending driver', "UPDATE khedmah_taxi.driver_approvals SET status='pending' WHERE user_id=$1", [user], ForbiddenException],
      ['revoked driver', "UPDATE khedmah_taxi.driver_approvals SET status='revoked' WHERE user_id=$1", [user], ForbiddenException],
      ['suspended vehicle', "UPDATE khedmah_taxi.vehicle_approvals SET status='suspended' WHERE id='test-vehicle'", [], ForbiddenException],
      ['vehicle assigned to another account', "UPDATE khedmah_taxi.vehicle_approvals SET driver_user_id=$1 WHERE id='test-vehicle'", [stranger], ForbiddenException],
      ['expired license', "UPDATE khedmah_taxi.driver_approvals SET expires_at=clock_timestamp()-interval '1 second' WHERE user_id=$1", [user], ForbiddenException],
      ['expired vehicle approval', "UPDATE khedmah_taxi.vehicle_approvals SET expires_at=clock_timestamp()-interval '1 second' WHERE id='test-vehicle'", [], ForbiddenException],
      ['future driver approval', "UPDATE khedmah_taxi.driver_approvals SET approved_at=clock_timestamp()+interval '1 minute' WHERE user_id=$1", [user], ForbiddenException]
    ] as const) {
      await t.test(`rejects ${name} before any trip callback`, async () => {
        await reset(); await pool.query(sql, [...parameters]); let ran = false;
        await assert.rejects(access.withActor(token, 'driver', async () => { ran = true; }), error);
        assert.equal(ran, false); assert.equal(await count(), 0);
      });
    }
    await t.test('the low-privilege runtime cannot approve itself, rewrite evidence or read credentials', async () => {
      for (const sql of [
        'SELECT * FROM public.identity_credentials', 'SELECT * FROM public.identity_sessions',
        'SELECT verification_reference FROM khedmah_taxi.driver_approvals',
        "UPDATE khedmah_taxi.driver_approvals SET status='approved'", 'DELETE FROM khedmah_taxi.vehicle_approvals',
        'CREATE TABLE khedmah_taxi.forged(id TEXT)',
        'ALTER FUNCTION khedmah_taxi.resolve_actor_locked(TEXT, BOOLEAN) RENAME TO forged'
      ]) {
        await assert.rejects(runtimeDb.transaction(c => c.query(sql)), (e: any) => e.code === '42501');
      }
    });
    await t.test('schema constraints reject self-approval by the proposed approval writer', async () => {
      await assert.rejects(pool.query('UPDATE khedmah_taxi.driver_approvals SET reviewed_by=user_id'), (e: any) => e.code === '23514');
      await assert.rejects(pool.query('UPDATE khedmah_taxi.vehicle_approvals SET reviewed_by=driver_user_id'), (e: any) => e.code === '23514');
    });
    await t.test('definer privilege ends before the trip callback, on the same runtime connection', async () => {
      await reset();
      await access.withActor(token, 'driver', async (client, actor) => {
        const { rows } = await client.query<{ who: string }>('SELECT current_user AS who');
        assert.equal(rows[0].who, role);
        await client.query(`INSERT INTO public."${marker}" VALUES($1,current_user)`, [actor.id]);
      });
      assert.equal(await count(), 1);
    });
    for (const [name, lock, change, parameters, error] of [
      ['session logout', 'SELECT session_identifier FROM public.identity_sessions WHERE user_identifier=$1 FOR UPDATE', 'UPDATE public.identity_sessions SET revoked_at=clock_timestamp() WHERE user_identifier=$1', [user], UnauthorizedException],
      ['driver revocation', 'SELECT user_id FROM khedmah_taxi.driver_approvals WHERE user_id=$1 FOR UPDATE', "UPDATE khedmah_taxi.driver_approvals SET status='revoked' WHERE user_id=$1", [user], ForbiddenException],
      ['vehicle revocation', 'SELECT id FROM khedmah_taxi.vehicle_approvals WHERE driver_user_id=$1 FOR UPDATE', "UPDATE khedmah_taxi.vehicle_approvals SET status='revoked' WHERE driver_user_id=$1", [user], ForbiddenException]
    ] as const) {
      await t.test(`a concurrent ${name} is observed after a real row-lock wait`, async () => {
        await reset(); const blocker = await pool.connect(); let held = false, finished = false, called = false;
        let pending: Promise<unknown> | undefined;
        try {
          await blocker.query('BEGIN'); held = true; await blocker.query(lock, [...parameters]); writerPid = undefined;
          pending = access.withActor(token, 'driver', async () => { called = true; }).then(
            () => { finished = true; return null; }, e => { finished = true; return e; });
          await until(async () => {
            assert.equal(finished, false); if (!writerPid) return false;
            const row = (await pool.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [writerPid])).rows[0];
            return row?.wait_event_type === 'Lock';
          }, 'Authorization did not wait for the PostgreSQL row lock.');
          await blocker.query(change, [...parameters]); await blocker.query('COMMIT'); held = false;
          assert.ok((await pending) instanceof error); assert.equal(called, false); assert.equal(await count(), 0);
        } finally {
          if (held) await blocker.query('ROLLBACK'); await pending; blocker.release();
        }
      });
    }
    await t.test('approval locks remain held until the trip callback commits', async () => {
      await reset(); const blocker = await pool.connect();
      let enter!: () => void, release!: () => void;
      const entered = new Promise<void>(done => { enter = done; });
      const proceed = new Promise<void>(done => { release = done; });
      let update: Promise<unknown> | undefined, completed = false;
      const running = access.withActor(token, 'driver', async (client, actor) => {
        enter(); await proceed;
        await client.query(`INSERT INTO public."${marker}" VALUES($1,current_user)`, [actor.id]);
      });
      try {
        await entered;
        const pid = (await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        update = blocker.query("UPDATE khedmah_taxi.driver_approvals SET status='revoked' WHERE user_id=$1", [user]).then(() => { completed = true; });
        await until(async () => {
          assert.equal(completed, false);
          return (await pool.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [pid])).rows[0]?.wait_event_type === 'Lock';
        }, 'Revocation did not wait for the in-flight authorized work.');
        release(); await running; await update;
        assert.equal(await count(), 1);
        await assert.rejects(access.access(token, 'driver'), ForbiddenException);
      } finally { release(); await running; await update; blocker.release(); }
    });
    await t.test('expiration during trip work rolls its writes back before commit', async () => {
      await reset();
      await pool.query(`UPDATE khedmah_taxi.driver_approvals SET expires_at=clock_timestamp()+interval '600 milliseconds' WHERE user_id=$1`, [user]);
      let entered = false;
      await assert.rejects(access.withActor(token, 'driver', async (client, actor) => {
        entered = true;
        await client.query(`INSERT INTO public."${marker}" VALUES($1,current_user)`, [actor.id]);
        await client.query('SELECT pg_sleep(0.8)');
      }), UnauthorizedException);
      assert.equal(entered, true); assert.equal(await count(), 0);
    });
    await t.test('callback failure rolls back without replacing the original error', async () => {
      await reset(); const original = new Error('test trip failure');
      await assert.rejects(access.withActor(token, 'driver', async (client, actor) => {
        await client.query(`INSERT INTO public."${marker}" VALUES($1,current_user)`, [actor.id]); throw original;
      }), e => e === original); assert.equal(await count(), 0);
    });
    await t.test('missing candidate function yields a safe unavailable response, never a driver', async () => {
      await pool.query('ALTER FUNCTION khedmah_taxi.resolve_actor_locked(TEXT, BOOLEAN) RENAME TO unavailable_for_test');
      try { await assert.rejects(access.access(token, 'customer'), ServiceUnavailableException); }
      finally { await pool.query('ALTER FUNCTION khedmah_taxi.unavailable_for_test(TEXT, BOOLEAN) RENAME TO resolve_actor_locked'); }
    });
    await t.test('native Nest routes use the canonical cookie, ignore role spoofing and prevent caching', async () => {
      await reset();
      @Module({ controllers: [TaxiAccessController], providers: [{ provide: TaxiAccessService, useValue: access }] })
      class AcceptanceModule {}
      const app = await NestFactory.create(AcceptanceModule, { logger: false });
      app.setGlobalPrefix('api/v1'); await app.listen(0, '127.0.0.1');
      const address = app.getHttpServer().address(); const origin = `http://127.0.0.1:${address.port}`;
      try {
        const rider = await fetch(`${origin}/api/v1/taxi/rider/access?role=operator`, { headers: { cookie: `khedmah_session=${token}`, 'x-role': 'driver' } });
        assert.equal(rider.status, 200); assert.match(rider.headers.get('cache-control') ?? '', /no-store/);
        assert.deepEqual(await rider.json(), { id: user, role: 'customer' });
        const driver = await fetch(`${origin}/api/v1/taxi/driver/access`, { headers: { cookie: `khedmah_session=${token}` } });
        assert.equal(driver.status, 200); assert.equal((await driver.json() as any).vehicleId, 'test-vehicle');
        assert.equal((await fetch(`${origin}/api/v1/taxi/driver/access`, { headers: { cookie: `khedmah_session=${strangerToken}` } })).status, 403);
        assert.equal((await fetch(`${origin}/api/v1/taxi/rider/access`, { headers: { cookie: 'khedmah_session=%ZZ' } })).status, 401);
        process.env.TAXI_ACCESS_ENABLED = 'false';
        assert.equal((await fetch(`${origin}/api/v1/taxi/rider/access`)).status, 503);
      } finally { process.env.TAXI_ACCESS_ENABLED = 'true'; await app.close(); }
    });
  } finally {
    if (createdSchema) await pool.query('DROP SCHEMA khedmah_taxi CASCADE');
    if (createdMarker) await pool.query(`DROP TABLE public."${marker}"`);
    if (createdRole) { await pool.query(`DROP OWNED BY "${role}"`); await pool.query(`DROP ROLE "${role}"`); }
    await pool.end();
    if (saved.mode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = saved.mode;
    if (saved.flag === undefined) delete process.env.TAXI_ACCESS_ENABLED; else process.env.TAXI_ACCESS_ENABLED = saved.flag;
  }
});
