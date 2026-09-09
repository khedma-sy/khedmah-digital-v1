import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { Module, HttpException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { PoolClient } from 'pg';
import { DatabasePool } from '../database/database.pool';
import { createTestPool, resetCanonicalTestSchema } from '../database/test-pool';
import { IdentityRepository } from '../identity/identity.repository';
import { SessionTokenService } from '../identity/security/session-token.service';
import { createCsrfOriginMiddleware } from '../middleware/csrf-origin.middleware';
import { TaxiAccessService } from './taxi-access.service';
import { TaxiTripService, taxiRouteKey } from './taxi-trip.service';
import { TaxiTripController } from './taxi-trip.controller';
import { TaxiModule } from './taxi.module';
import type { Order, Quote } from './engine/domain';

// Native Nest + retained RP30 engine + canonical sessions + actual PostgreSQL.
// Route, tariff, document references and meter readings are explicitly TEST data.
test('Taxi trip uses one native authority transaction and independently issued references', {timeout:90000}, async t=>{
  const envKeys=['NODE_ENV','TAXI_ACCESS_ENABLED','TAXI_TRIPS_ENABLED','TAXI_OPERATING_ZONE','CORS_ORIGIN'] as const;
  const saved=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
  Object.assign(process.env,{NODE_ENV:'test',TAXI_ACCESS_ENABLED:'true',TAXI_TRIPS_ENABLED:'true',TAXI_OPERATING_ZONE:'rp33-test',CORS_ORIGIN:'https://rp33.example.test'});
  const pool=createTestPool(),db=DatabasePool.fromPool(pool),identity=new IdentityRepository(db),tokens=new SessionTokenService();
  const suffix=randomUUID().replaceAll('-','');
  const owner=`taxi_owner_${suffix}`,runtime=`taxi_web_${suffix}`,issuer=`taxi_proof_${suffix}`,reference=`taxi_ref_${suffix}`;
  const roles:string[]=[],people=Object.fromEntries(['rider','other','driver','second','reviewer'].map(k=>[k,randomUUID()]));
  const sessions=Object.fromEntries(Object.keys(people).map(k=>[k,tokens.createToken()]));
  let schema=false,transactions=0;
  const runtimeDb={transaction:<T>(work:(c:PoolClient)=>Promise<T>)=>db.transaction(async c=>{
    transactions++;await c.query(`SET LOCAL ROLE "${runtime}"`);return work(c);
  })} as DatabasePool;
  const access=new TaxiAccessService(runtimeDb,tokens),service=new TaxiTripService(access);
  const coordinates={pickup:{area:'test-pickup',detail:'PRIVATE TEST PICKUP',latitude:33.5,longitude:36.2},
    dropoff:{area:'test-dropoff',detail:'PRIVATE TEST DESTINATION',latitude:33.6,longitude:36.3}};
  const routeKey=taxiRouteKey('rp33-test',coordinates.pickup,coordinates.dropoff);
  const tariff={currency:'XTS',quoteTtlMs:120000,taxiBaseMinor:100,taxiPerKmMinor:200,taxiWaitPerMinuteMinor:60,taxiMinimumMinor:200,maxAmountMinor:100000};
  const asRole=<T>(role:string,work:(c:PoolClient)=>Promise<T>)=>db.transaction(async c=>{await c.query(`SET LOCAL ROLE "${role}"`);return work(c);});
  const query=(sql:string,args:unknown[]=[])=>pool.query(sql,args);
  const now=async()=>Number((await query('SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms')).rows[0].ms);
  const count=async(table:string)=>Number((await query(`SELECT count(*) AS n FROM khedmah_taxi.${table}`)).rows[0].n);
  const rejects=(promise:Promise<unknown>,status:number)=>assert.rejects(promise,(e:unknown)=>e instanceof HttpException&&e.getStatus()===status);
  async function resetReferences(){
    await asRole(reference,c=>c.query(`UPDATE khedmah_taxi.tariffs SET revision=1,payload=$1,enabled=true,valid_until=clock_timestamp()+interval '1 hour'`,[JSON.stringify(tariff)]));
    await asRole(reference,c=>c.query(`UPDATE khedmah_taxi.routes SET revision=1,distance_meters=5000,enabled=true,expires_at=clock_timestamp()+interval '1 hour'`));
  }
  const quote=(person='rider',body:unknown=coordinates)=>service.quote(sessions[person],body);
  const place=async(person='rider')=>service.place(sessions[person],{quoteId:(await quote(person)).id,requestId:randomUUID()});
  const command=(o:Order,action:string,person='driver',extra:Record<string,unknown>={})=>service.command(sessions[person],person==='rider'||person==='other'?'customer':'driver',o.id,{action,expectedVersion:o.version,requestId:randomUUID(),...extra});
  async function proof(o:Order,action:string,data:Record<string,unknown>={},changes:Record<string,unknown>={}){
    const p={id:randomUUID(),order_id:o.id,actor_id:o.delivery.providerId,action,expected_version:o.version,
      expires_at_ms:(await now())+60000,source:'synthetic-independent-proof-writer',payload:JSON.stringify({
        ...o.taxiAssignment,observedAt:await now(),...data}),...changes};
    await asRole(issuer,c=>c.query(`INSERT INTO khedmah_taxi.jt_evidence(id,order_id,actor_id,action,expected_version,expires_at_ms,source,payload)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,Object.values(p)));
    return p.id as string;
  }
  const cancel=(o:Order)=>command(o,'cancel','rider');
  const assigned=async()=>command(await place(),'accept_job');
  const arrived=async()=>{const o=await assigned();return command(o,'arrive_pickup','driver',{proofId:await proof(o,'arrive_pickup')});};
  const started=async()=>{const o=await arrived();const a=await service.consent(sessions.rider,o.id,{expectedVersion:o.version});return command(o,'start_ride','driver',{proofId:a.proofId});};
  const finish=async(o:Order)=>command(o,'finish_ride','driver',{proofId:await proof(o,'finish_ride',{tripMeters:7500,waitSeconds:0,startEventId:o.rideStartEventId})});
  try{
    await resetCanonicalTestSchema(pool);
    for(const r of [owner,runtime,issuer,reference]){await query(`CREATE ROLE "${r}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);roles.push(r);}
    await db.transaction(async c=>{
      await c.query(await readFile(resolve(__dirname,'sql/access.candidate.sql'),'utf8'));schema=true;
      await c.query(await readFile(resolve(__dirname,'sql/trips.candidate.sql'),'utf8'));
      await c.query(`ALTER SCHEMA khedmah_taxi OWNER TO "${owner}"`);
      const tables=await c.query<{name:string}>(`SELECT tablename AS name FROM pg_tables WHERE schemaname='khedmah_taxi'`);
      for(const {name} of tables.rows) await c.query(`ALTER TABLE khedmah_taxi."${name}" OWNER TO "${owner}"`);
      const functions=await c.query<{signature:string}>(`SELECT p.oid::regprocedure::text AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='khedmah_taxi'`);
      for(const {signature} of functions.rows) await c.query(`ALTER FUNCTION ${signature} OWNER TO "${owner}"`);
      await c.query(`GRANT USAGE ON SCHEMA public,khedmah_taxi TO "${owner}","${runtime}","${issuer}","${reference}"`);
      await c.query(`GRANT SELECT,UPDATE ON public.identity_sessions,public.core_user_accounts,public.identity_credentials,public.profiles TO "${owner}"`);
      await c.query(`GRANT EXECUTE ON FUNCTION khedmah_taxi.resolve_actor_locked(TEXT,BOOLEAN),khedmah_taxi.read_tariff_locked(TEXT),khedmah_taxi.read_route_locked(TEXT,TEXT) TO "${runtime}"`);
      await c.query(`GRANT SELECT,INSERT ON khedmah_taxi.jt_quotes,khedmah_taxi.jt_receipts,khedmah_taxi.jt_events,khedmah_taxi.jt_outbox,khedmah_taxi.jt_cash_receipts,khedmah_taxi.jt_ride_consents TO "${runtime}"`);
      await c.query(`GRANT UPDATE(consumed_order_id) ON khedmah_taxi.jt_quotes TO "${runtime}"`);
      await c.query(`GRANT SELECT,INSERT,UPDATE ON khedmah_taxi.jt_orders TO "${runtime}"`);
      await c.query(`GRANT SELECT,UPDATE(consumed_event_id) ON khedmah_taxi.jt_evidence TO "${runtime}"`);
      await c.query(`GRANT UPDATE(consumed_event_id) ON khedmah_taxi.jt_ride_consents TO "${runtime}"`);
      await c.query(`GRANT INSERT(id,order_id,actor_id,action,expected_version,expires_at_ms,source,payload) ON khedmah_taxi.jt_evidence TO "${issuer}"`);
      await c.query(`GRANT SELECT,INSERT,UPDATE ON khedmah_taxi.tariffs,khedmah_taxi.routes TO "${reference}"`);
    });
    const timestamp=new Date().toISOString();
    for(const [name,id] of Object.entries(people)){
      await identity.saveAccount({id,email:`${id}@example.test`,passwordHash:'test-not-a-login-hash',status:'active',createdAt:timestamp,updatedAt:timestamp});
      await identity.saveProfile({userId:id,displayName:'RP33 disposable actor',locale:'ar',createdAt:timestamp,updatedAt:timestamp});
      await identity.saveSession({id:randomUUID(),userId:id,tokenHash:tokens.hashToken(sessions[name]),expiresAt:tokens.expiresAt(),createdAt:timestamp});
    }
    for(const who of ['driver','second']){
      await query(`INSERT INTO khedmah_taxi.vehicle_approvals VALUES($1,$2,'approved',$3,'synthetic-registration-reference',clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 hour',1)`,[`vehicle-${who}`,people[who],people.reviewer]);
      await query(`INSERT INTO khedmah_taxi.driver_approvals VALUES($1,$2,'rp33-test','approved',$3,'synthetic-license-reference',clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 hour',1)`,[people[who],`vehicle-${who}`,people.reviewer]);
    }
    await asRole(reference,c=>c.query(`INSERT INTO khedmah_taxi.tariffs VALUES('rp33-test',1,$1,true,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour')`,[JSON.stringify(tariff)]));
    await asRole(reference,c=>c.query(`INSERT INTO khedmah_taxi.routes VALUES($1,'synthetic-route','rp33-test',1,5000,'synthetic-approved-router',true,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour')`,[routeKey]));

    await t.test('native module registers the retained-engine HTTP boundary',()=>{
      assert.ok(Reflect.getMetadata('controllers',TaxiModule).includes(TaxiTripController));
      assert.ok(Reflect.getMetadata('providers',TaxiModule).includes(TaxiTripService));
    });
    await t.test('full native HTTP trip: quote, lost-response recovery, assignment, proof, consent, meter, cash and rating',async()=>{
      @Module({controllers:[TaxiTripController],providers:[{provide:TaxiTripService,useValue:service}]}) class AcceptanceModule{}
      const app=await NestFactory.create(AcceptanceModule,{logger:false});app.use(createCsrfOriginMiddleware());app.setGlobalPrefix('api/v1');await app.listen(0,'127.0.0.1');
      const origin=`http://127.0.0.1:${app.getHttpServer().address().port}`;
      const trace:Array<{step:string;status:number}>=[];
      async function request<T>(path:string,person:string,body?:unknown):Promise<T>{
        const response=await fetch(`${origin}/api/v1/taxi/${path}`,{method:body===undefined?'GET':'POST',headers:{cookie:`khedmah_session=${sessions[person]}`,origin:process.env.CORS_ORIGIN!,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
        trace.push({step:path.replace(/[a-f0-9-]{36}/g,':id'),status:response.status});
        assert.ok(response.ok,`${path}: ${response.status} ${response.ok?'':await response.text()}`);
        assert.match(response.headers.get('cache-control')??'',/no-store/);return response.json() as Promise<T>;
      }
      const beforeTx=transactions;
      try{
        const q=await request<Quote>('rider/quotes','rider',coordinates);assert.equal(q.totalMinor,1100);assert.equal(q.routeReference?.id,'synthetic-route');
        const input={quoteId:q.id,requestId:randomUUID()};let o=await request<Order>('rider/trips','rider',input);
        const again=await request<Order>('rider/trips','rider',input);assert.equal(again.id,o.id);
        const offers=await request<{offers:unknown[]}>('driver/offers','driver');assert.doesNotMatch(JSON.stringify(offers),/PRIVATE|customerId|latitude|longitude/);
        const action=async(name:string,who:string,extra:Record<string,unknown>={})=>request<Order>(`${who==='rider'?'rider':'driver'}/trips/${o.id}/actions`,who,{action:name,expectedVersion:o.version,requestId:randomUUID(),...extra});
        o=await action('accept_job','driver');assert.equal(o.taxiAssignment?.vehicleId,'vehicle-driver');
        o=await action('arrive_pickup','driver',{proofId:await proof(o,'arrive_pickup')});
        const consent=await request<{proofId:string}>(`rider/trips/${o.id}/consent`,'rider',{expectedVersion:o.version});
        assert.equal((await service.read(sessions.rider,'customer',o.id)).phase,'accepted');
        assert.equal((await request<{proofId:string}>(`driver/trips/${o.id}/authorization`,'driver')).proofId,consent.proofId);
        o=await action('start_ride','driver',{proofId:consent.proofId});assert.equal(o.phase,'in_progress');
        await asRole(reference,c=>c.query(`UPDATE khedmah_taxi.tariffs SET revision=2,payload=jsonb_set(payload,'{taxiPerKmMinor}','999'),valid_until=clock_timestamp()-interval '1 second'`));
        o=await action('finish_ride','driver',{proofId:await proof(o,'finish_ride',{tripMeters:7500,waitSeconds:0,startEventId:o.rideStartEventId})});
        assert.equal(o.cash.expectedMinor,1600);assert.equal(o.phase,'completed');
        o=await action('record_cash','driver',{amountMinor:1600});assert.equal(o.cash.status,'collected');
        o=await action('rate','rider',{rating:5});
        const restored=await new TaxiTripService(new TaxiAccessService(runtimeDb,tokens)).read(sessions.rider,'customer',o.id);assert.equal(restored.version,o.version);
        const rows=(await query('SELECT (SELECT count(*) FROM khedmah_taxi.jt_orders WHERE id=$1) orders,(SELECT count(*) FROM khedmah_taxi.jt_events WHERE order_id=$1) events,(SELECT count(*) FROM khedmah_taxi.jt_cash_receipts WHERE order_id=$1) cash',[o.id])).rows[0];
        assert.equal(Number(rows.orders),1);assert.equal(Number(rows.events),7);assert.equal(Number(rows.cash),1);
        console.log('RP33_HTTP_EVIDENCE',JSON.stringify({trace,phase:o.phase,cash:o.cash.status,orders:Number(rows.orders),events:Number(rows.events),cashReceipts:Number(rows.cash)}));
        // Every public operation above owns one access transaction, not an outer authority check plus another commit.
        assert.equal(transactions-beforeTx,trace.length+2);
      } finally {await app.close();await resetReferences();}
    });
    await t.test('PostgreSQL int8 archive flags keep active trips readable and archived trips hidden',async()=>{
      const q=await quote(),input={quoteId:q.id,requestId:randomUUID()};
      let o=await service.place(sessions.rider,input);
      const raw=(await query('SELECT archived,payload FROM khedmah_taxi.jt_orders WHERE id=$1',[o.id])).rows[0];
      assert.equal(raw.archived,'0');assert.equal(typeof raw.payload,'object');
      assert.equal((await service.read(sessions.rider,'customer',o.id)).id,o.id);
      assert.equal((await service.place(sessions.rider,input)).id,o.id);
      o=await cancel(o);await query('UPDATE khedmah_taxi.jt_orders SET archived=1 WHERE id=$1',[o.id]);
      await rejects(service.read(sessions.rider,'customer',o.id),404);
      await assert.rejects(service.place(sessions.rider,input));
      assert.equal(Number((await query('SELECT count(*) n FROM khedmah_taxi.jt_orders WHERE id=$1',[o.id])).rows[0].n),1);
    });
    // Force a genuine PostgreSQL wait AFTER validation and aggregate/event writes.
    // Never use this on a shared or operational database: createTestPool above
    // requires the canonical, explicitly disposable database/host configuration.
    for(const kind of ['proof','quote'] as const) await t.test(`expiry at commit rolls back ${kind} after a real outbox table-lock wait`,async()=>{
      await resetReferences();
      if(kind==='quote')await asRole(reference,c=>c.query("UPDATE khedmah_taxi.tariffs SET payload=jsonb_set(payload,'{quoteTtlMs}','2000')"));
      const o=kind==='proof'?await assigned():undefined;
      const q=kind==='quote'?await quote():undefined;
      const deadline=q?.expiresAt??(await now())+2000;
      const proofId=o?await proof(o,'arrive_pickup',{}, {expires_at_ms:deadline}):undefined;
      const tables=['jt_orders','jt_events','jt_outbox','jt_receipts','jt_quotes','jt_evidence'];
      const snapshot=async()=>{
        const result:Record<string,unknown>={};
        for(const table of tables)result[table]=(await query(`SELECT * FROM khedmah_taxi.${table} ORDER BY 1`)).rows;
        return result;
      };
      const before=await snapshot(),blocker=await pool.connect();let held=false,finished=false,pid:number|undefined;
      let pending:Promise<unknown>|undefined;
      const observedDb={transaction:<T>(work:(client:PoolClient)=>Promise<T>)=>db.transaction(async client=>{
        await client.query(`SET LOCAL ROLE "${runtime}"`);
        pid=(await client.query<{pid:number}>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        return work(client);
      })} as DatabasePool;
      const observed=new TaxiTripService(new TaxiAccessService(observedDb,tokens));
      try{
        await blocker.query('BEGIN');held=true;await blocker.query('LOCK TABLE khedmah_taxi.jt_outbox IN ACCESS EXCLUSIVE MODE');
        const operation=o?observed.command(sessions.driver,'driver',o.id,{action:'arrive_pickup',expectedVersion:o.version,requestId:randomUUID(),proofId})
          :observed.place(sessions.rider,{quoteId:q!.id,requestId:randomUUID()});
        pending=operation.then(value=>{finished=true;return value;},error=>{finished=true;return error;});
        let blocked=false;const waitUntil=Date.now()+4000;
        while(Date.now()<waitUntil){
          assert.equal(finished,false,'operation must reach the outbox wait before expiry');
          if(pid){
            const row=(await query('SELECT wait_event_type,query FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0];
            if(row?.wait_event_type==='Lock'&&row.query.startsWith('INSERT INTO jt_outbox')){blocked=true;break;}
          }
          await delay(10);
        }
        assert.equal(blocked,true,'the observed wait must be for outbox persistence, not an earlier authority lock');
        while((await now())<=deadline+20)await delay(10);
        await blocker.query('COMMIT');held=false;
        const error=await pending;
        assert.ok(error instanceof HttpException);assert.equal(error.getStatus(),409);
        assert.equal((error.getResponse() as {code:string}).code,kind==='proof'?'PROOF_INVALID':'QUOTE_EXPIRED');
        assert.deepEqual(await snapshot(),before);
      }finally{
        if(held)await blocker.query('ROLLBACK');await pending;blocker.release();await resetReferences();
        if(o)await cancel(await service.read(sessions.rider,'customer',o.id));
      }
    });
    await t.test('runtime cannot write tariff/routes, issue or rewrite proof, or self-approve',async()=>{
      for(const sql of [
        "UPDATE khedmah_taxi.tariffs SET revision=9","UPDATE khedmah_taxi.routes SET distance_meters=1",
        "INSERT INTO khedmah_taxi.jt_evidence(id) VALUES('forged')","UPDATE khedmah_taxi.jt_evidence SET payload='{}'",
        "UPDATE khedmah_taxi.jt_evidence SET expires_at_ms=9999999999999","UPDATE khedmah_taxi.driver_approvals SET status='approved'",
        'SELECT * FROM public.identity_sessions',"ALTER FUNCTION khedmah_taxi.read_route_locked(TEXT,TEXT) RENAME TO forged"
      ]) await assert.rejects(asRole(runtime,c=>c.query(sql)),(e:any)=>e.code==='42501');
      for(const r of [owner,runtime,issuer,reference]) assert.equal((await query('SELECT rolsuper FROM pg_roles WHERE rolname=$1',[r])).rows[0].rolsuper,false);
      await assert.rejects(asRole(issuer,c=>c.query('UPDATE khedmah_taxi.jt_orders SET version=9')),(e:any)=>e.code==='42501');
    });
    await t.test('concurrent creation retries and two keys for one quote produce exactly one trip',async()=>{
      const q=await quote(),key=randomUUID(),before=await count('jt_orders');
      const values=await Promise.all([key,key,randomUUID()].map(requestId=>service.place(sessions.rider,{quoteId:q.id,requestId})));
      assert.equal(new Set(values.map(x=>x.id)).size,1);assert.equal(await count('jt_orders'),before+1);await cancel(values[0]);
    });
    await t.test('request key cannot be rebound to a different quote',async()=>{
      const q=await quote(),key=randomUUID(),o=await service.place(sessions.rider,{quoteId:q.id,requestId:key});
      await rejects(service.place(sessions.rider,{quoteId:(await quote()).id,requestId:key}),409);await cancel(o);
    });
    await t.test('quote is account-scoped and creation cannot override price or driver',async()=>{
      const q=await quote();await rejects(service.place(sessions.other,{quoteId:q.id,requestId:randomUUID()}),404);
      await rejects(service.place(sessions.rider,{quoteId:q.id,requestId:randomUUID(),driverId:people.driver}),400);
      await rejects(quote('rider',{...coordinates,totalMinor:1}),400);
    });
    await t.test('two approved drivers racing for one trip produce one assignment',async()=>{
      const o=await place();const results=await Promise.allSettled(['driver','second'].map(w=>command(o,'accept_job',w)));
      assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
      const current=await service.read(sessions.rider,'customer',o.id);assert.equal(current.version,2);await cancel(current);
    });
    await t.test('one driver cannot accept two active trips concurrently',async()=>{
      const list=await Promise.all([place(),place()]);const results=await Promise.allSettled(list.map(o=>command(o,'accept_job')));
      assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
      for(const o of list) await cancel(await service.read(sessions.rider,'customer',o.id));
    });
    await t.test('a stale cancellation cannot overwrite driver acceptance',async()=>{
      const first=await place(),o=await command(first,'accept_job');await rejects(cancel(first),409);assert.equal((await service.read(sessions.rider,'customer',o.id)).phase,'accepted');await cancel(o);
    });
    await t.test('tariff edits and route revision changes invalidate new placement without partial writes',async()=>{
      const q=await quote(),before=await count('jt_orders');
      await asRole(reference,c=>c.query('UPDATE khedmah_taxi.tariffs SET revision=revision+1'));
      await rejects(service.place(sessions.rider,{quoteId:q.id,requestId:randomUUID()}),409);await resetReferences();
      await asRole(reference,c=>c.query('UPDATE khedmah_taxi.routes SET revision=revision+1'));
      await rejects(service.place(sessions.rider,{quoteId:q.id,requestId:randomUUID()}),409);await resetReferences();assert.equal(await count('jt_orders'),before);
    });
    await t.test('missing or disabled routing fails closed with no straight-line fallback',async()=>{
      await rejects(quote('rider',{...coordinates,dropoff:{...coordinates.dropoff,latitude:34}}),503);
      await asRole(reference,c=>c.query('UPDATE khedmah_taxi.routes SET enabled=false'));
      try{await rejects(quote(),503);}finally{await resetReferences();}
    });
    await t.test('committed placement replays even after route and tariff expire',async()=>{
      const q=await quote(),input={quoteId:q.id,requestId:randomUUID()},o=await service.place(sessions.rider,input);
      await asRole(reference,c=>c.query('UPDATE khedmah_taxi.routes SET enabled=false'));
      await asRole(reference,c=>c.query('UPDATE khedmah_taxi.tariffs SET enabled=false'));
      try{assert.equal((await service.place(sessions.rider,input)).id,o.id);await cancel(o);}finally{await resetReferences();}
    });
    await t.test('arrival proof must match trip, driver, version and vehicle',async()=>{
      const o=await assigned();
      for(const [data,changes] of [[{vehicleId:'another-vehicle'},{}],[{observedAt:0},{}],[{},{actor_id:people.second}],[{},{expected_version:1}]])
        await rejects(command(o,'arrive_pickup','driver',{proofId:await proof(o,'arrive_pickup',data,changes)}),409);
      assert.equal((await service.read(sessions.rider,'customer',o.id)).version,o.version);await cancel(o);
    });
    await t.test('only the owning rider can consent, only at pickup, and consent alone does not start charging',async()=>{
      const o=await assigned();await rejects(service.consent(sessions.rider,o.id,{expectedVersion:o.version}),409);await cancel(o);
      const at=await arrived();await rejects(service.consent(sessions.other,at.id,{expectedVersion:at.version}),404);
      const a=await service.consent(sessions.rider,at.id,{expectedVersion:at.version}),b=await service.consent(sessions.rider,at.id,{expectedVersion:at.version});assert.equal(a.proofId,b.proofId);
      assert.equal((await service.read(sessions.rider,'customer',at.id)).phase,'accepted');await cancel(at);
    });
    await t.test('reassignment invalidates the previous driver consent',async()=>{
      let o=await arrived();const a=await service.consent(sessions.rider,o.id,{expectedVersion:o.version});
      o=await command(o,'release_job','driver',{reason:'test reassignment'});assert.equal(o.taxiAssignment,undefined);
      o=await command(o,'accept_job','second');o=await command(o,'arrive_pickup','second',{proofId:await proof(o,'arrive_pickup')});
      await rejects(command(o,'start_ride','second',{proofId:a.proofId}),409);await cancel(o);
    });
    await t.test('changed vehicle approval cannot silently change the assigned vehicle snapshot',async()=>{
      const o=await assigned();await query('UPDATE khedmah_taxi.vehicle_approvals SET revision=2 WHERE id=$1',['vehicle-driver']);
      try{await rejects(command(o,'arrive_pickup','driver',{proofId:await proof(o,'arrive_pickup')}),409);}
      finally{await query('UPDATE khedmah_taxi.vehicle_approvals SET revision=1 WHERE id=$1',['vehicle-driver']);await cancel(o);}
    });
    await t.test('native access is rechecked on every command after session or driver revocation',async()=>{
      const o=await assigned();await query("UPDATE khedmah_taxi.driver_approvals SET status='revoked' WHERE user_id=$1",[people.driver]);
      try{await rejects(command(o,'arrive_pickup','driver',{proofId:randomUUID()}),403);}finally{await query("UPDATE khedmah_taxi.driver_approvals SET status='approved' WHERE user_id=$1",[people.driver]);}
      await query('UPDATE identity_sessions SET revoked_at=clock_timestamp() WHERE user_identifier=$1',[people.driver]);
      try{await rejects(command(o,'arrive_pickup','driver',{proofId:randomUUID()}),401);}finally{await query('UPDATE identity_sessions SET revoked_at=NULL WHERE user_identifier=$1',[people.driver]);await cancel(o);}
    });
    await t.test('meter rejects strings/null/booleans, wrong start event and stale observations',async()=>{
      const o=await started();const valid={tripMeters:7500,waitSeconds:0,startEventId:o.rideStartEventId};
      for(const bad of [{tripMeters:'7500'},{tripMeters:null},{tripMeters:true},{waitSeconds:86401},{observedAt:'0'},{observedAt:0},{startEventId:'another-start'}])
        await rejects(command(o,'finish_ride','driver',{proofId:await proof(o,'finish_ride',{...valid,...bad})}),409);
      assert.equal((await service.read(sessions.rider,'customer',o.id)).phase,'in_progress');await finish(o);
    });
    await t.test('proof consumption is atomic, cannot be reset, and replay does not consume twice',async()=>{
      let o=await assigned();const p=await proof(o,'arrive_pickup'),body={action:'arrive_pickup',expectedVersion:o.version,requestId:randomUUID(),proofId:p};
      o=await service.command(sessions.driver,'driver',o.id,body);
      assert.equal((await service.command(sessions.driver,'driver',o.id,body)).version,o.version);
      await assert.rejects(asRole(runtime,c=>c.query('UPDATE khedmah_taxi.jt_evidence SET consumed_event_id=NULL WHERE id=$1',[p])),(e:any)=>e.code==='55000');await cancel(o);
    });
    await t.test('failure inserting the outbox or consuming a proof rolls back the entire command',async()=>{
      let o=await assigned();const p=await proof(o,'arrive_pickup'),before=await count('jt_events');
      await query(`REVOKE INSERT ON khedmah_taxi.jt_outbox FROM "${runtime}"`);
      try{await rejects(command(o,'arrive_pickup','driver',{proofId:p}),503);}finally{await query(`GRANT INSERT ON khedmah_taxi.jt_outbox TO "${runtime}"`);}
      assert.equal((await service.read(sessions.rider,'customer',o.id)).version,o.version);assert.equal(await count('jt_events'),before);
      await query(`CREATE FUNCTION khedmah_taxi.reject_consumption_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected consume failure' USING ERRCODE='55000'; END $$;
        CREATE TRIGGER reject_consumption_test BEFORE UPDATE ON khedmah_taxi.jt_evidence FOR EACH ROW EXECUTE FUNCTION khedmah_taxi.reject_consumption_test()`);
      try{await rejects(command(o,'arrive_pickup','driver',{proofId:p}),500);}finally{
        await query('DROP TRIGGER reject_consumption_test ON khedmah_taxi.jt_evidence; DROP FUNCTION khedmah_taxi.reject_consumption_test()');
      }
      assert.equal((await service.read(sessions.rider,'customer',o.id)).version,o.version);assert.equal(await count('jt_events'),before);
      o=await command(o,'arrive_pickup','driver',{proofId:p});await cancel(o);
    });
    await t.test('fixed quote snapshot and append-only events/cash cannot be rewritten by the runtime',async()=>{
      const o=await finish(await started());await command(o,'record_cash','driver',{amountMinor:100});
      const got=await service.read(sessions.rider,'customer',o.id);assert.equal(got.cash.status,'discrepancy');
      await rejects(command(got,'settle_cash','rider'),403);await rejects(command(got,'record_cash'),409);
      await assert.rejects(asRole(runtime,c=>c.query("UPDATE khedmah_taxi.jt_orders SET payload=jsonb_set(payload,'{quote,totalMinor}','1') WHERE id=$1",[o.id])),(e:any)=>e.code==='55000');
      for(const table of ['jt_events','jt_cash_receipts']) await assert.rejects(asRole(runtime,c=>c.query(`DELETE FROM khedmah_taxi.${table}`)),(e:any)=>e.code==='42501');
    });
    await t.test('production, disabled trips, malformed session and foreign reads remain denied',async()=>{
      const o=await place();await rejects(service.read(sessions.other,'customer',o.id),404);await rejects(service.read(sessions.second,'driver',o.id),404);
      await rejects(service.quote('malformed',coordinates),401);
      process.env.TAXI_TRIPS_ENABLED='false';try{await rejects(quote(),503);}finally{process.env.TAXI_TRIPS_ENABLED='true';}
      process.env.NODE_ENV='production';try{await rejects(quote(),503);}finally{process.env.NODE_ENV='test';}await cancel(o);
    });
  }finally{
    if(schema) await query('DROP SCHEMA IF EXISTS khedmah_taxi CASCADE');
    for(const role of [...roles].reverse()){await query(`DROP OWNED BY "${role}"`);await query(`DROP ROLE "${role}"`);}
    await pool.end();for(const k of envKeys){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}
  }
});
