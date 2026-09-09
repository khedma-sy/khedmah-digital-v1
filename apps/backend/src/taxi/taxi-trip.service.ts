import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { HttpException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { TaxiAccessService, type TaxiActor, type TaxiAudience } from './taxi-access.service';
import { PersistentTaxiService } from './engine/server/taxi-service';
import { JourneyError, type Actor, type Address, type Policy, type Quote } from './engine/domain';
import type { SqlClient, ReferenceSnapshot } from './engine/server/ports';
import { fail, id, only } from './engine/server/input';

export function taxiRouteKey(zone: string, from: Address, to: Address): string {
  return createHash('sha256').update(JSON.stringify([zone, from.latitude, from.longitude, to.latitude, to.longitude])).digest('hex');
}
function policy(idValue: string, zone: string, raw: Record<string, unknown>, ttl: number): Policy {
  const keys = ['taxiBaseMinor','taxiPerKmMinor','taxiWaitPerMinuteMinor','taxiMinimumMinor','maxAmountMinor'] as const;
  if (typeof raw.currency !== 'string' || !/^[A-Z]{3}$/.test(raw.currency)
    || keys.some(k => !Number.isSafeInteger(raw[k]) || Number(raw[k]) < 0)
    || Number(raw.maxAmountMinor) < 1 || keys.some(k => Number(raw[k]) > Number(raw.maxAmountMinor)))
    fail('TARIFF_UNAVAILABLE',503,'التعرفة المعتمدة غير صالحة.');
  return { id:idValue,zone,currency:raw.currency,quoteTtlMs:ttl,maxParcelKg:1,
    foodDeliveryMinor:0,parcelBaseMinor:0,parcelPerKmMinor:0,roadsideInspectionMinor:0,
    ...Object.fromEntries(keys.map(k => [k,raw[k]])) } as Policy;
}
type Operation = 'quote' | 'place' | 'command' | 'read' | 'consent' | 'authorization' | 'offers';

/** Adapter of the retained RP30 engine; each public call owns exactly one RP32 transaction. */
@Injectable()
export class TaxiTripService {
  constructor(@Inject(TaxiAccessService) private readonly access: TaxiAccessService) {}

  private async run<T>(token: string | undefined, audience: TaxiAudience, operation: Operation,
    body: unknown, orderId: string | undefined, execute: (engine: PersistentTaxiService, session: string) => Promise<T>): Promise<T> {
    if(process.env.TAXI_TRIPS_ENABLED!=='true') throw new ServiceUnavailableException('Taxi trips are not enabled.');
    const zone=process.env.TAXI_OPERATING_ZONE;
    if(!zone || !/^[A-Za-z0-9_-]{1,50}$/.test(zone)) throw new ServiceUnavailableException('Taxi operating zone is not configured.');
    let active: { tx: SqlClient; actor: TaxiActor; now: number; tick: number; deadline: number } | undefined;
    const clock=() => active ? Math.floor(active.now + performance.now()-active.tick) : Date.now();
    const assertContext=(tx:SqlClient, actor?:Actor)=>{
      if(!active || tx!==active.tx || (actor && (actor.id!==active.actor.id || actor.role!==active.actor.role)))
        throw new Error('Taxi transaction scope violation.');
      return active;
    };
    const route = async (tx:SqlClient, from:Address, to:Address) => {
      const ctx=assertContext(tx);
      const {rows}=await tx.query<{id:string;revision:string;source:string;distance_meters:number;expires_at:Date}>(
        'SELECT * FROM khedmah_taxi.read_route_locked($1,$2)',[zone,taxiRouteKey(zone,from,to)]);
      const r=rows[0];
      if(!r || !Number.isSafeInteger(r.distance_meters) || !(r.expires_at instanceof Date)) fail('ROUTE_UNAVAILABLE',503,'لا يوجد مسار معتمد صالح لهذه الوجهة.');
      ctx.deadline=Math.min(ctx.deadline,r.expires_at.getTime());
      return {verified:true,distanceMeters:r.distance_meters,reference:{id:r.id,revision:r.revision,source:r.source,expiresAt:r.expires_at.getTime()}};
    };
    const engine=new PersistentTaxiService({
      db:{dialect:'postgres', transaction:work=>this.access.withActor(token,audience,async(pg,actor)=>{
        await pg.query('SET LOCAL search_path TO khedmah_taxi, pg_catalog, pg_temp');
        const time=await pg.query<{now_ms:string}>('SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS now_ms');
        const tx:SqlClient={query:async<R>(sql:string,params?:readonly unknown[])=>{
          const result=await pg.query(sql,params ? [...params] : undefined);
          return {rows:result.rows as R[],rowCount:result.rowCount??0};
        }};
        if(active) throw new Error('Nested Taxi transaction is not supported.');
        active={tx,actor,now:Number(time.rows[0].now_ms),tick:performance.now(),deadline:Infinity};
        try{
          const result=await work(tx);
          if(Number.isFinite(active.deadline)){
            const fresh=await pg.query<{valid:boolean}>('SELECT clock_timestamp() < to_timestamp($1::double precision/1000) AS valid',[active.deadline]);
            if(fresh.rows[0]?.valid!==true) fail('REFERENCE_EXPIRED',409,'انتهت صلاحية التسعير أو المسار؛ أعد المحاولة.');
          }
          return result;
        } finally { active=undefined; }
      })},
      identity:{resolveLocked:async(tx,session)=>{
        const ctx=assertContext(tx);
        if(session!==token) throw new Error('Taxi session scope violation.');
        return {id:ctx.actor.id,role:ctx.actor.role};
      }},
      references:{readLocked:async(tx,actor):Promise<ReferenceSnapshot>=>{
        const ctx=assertContext(tx,actor);let saved:Quote|undefined;
        // An already saved trip must remain recoverable after the active tariff expires.
        // Immutable quote snapshots are enforced by the candidate schema's trigger.
        if(orderId){
          const r=await tx.query<{quote:Quote}>('SELECT payload->\'quote\' AS quote FROM jt_orders WHERE id=$1 AND archived=0',[orderId]);
          saved=r.rows[0]?.quote;
        } else if(operation==='place'){
          const v=only(body,['quoteId','requestId']);
          const r=await tx.query<{quote:Quote}>(`SELECT o.payload->'quote' AS quote FROM jt_quotes q JOIN jt_orders o ON o.id=q.consumed_order_id
            WHERE q.id=$1 AND q.customer_id=$2 AND o.customer_id=$2 AND o.archived=0`,[id(v.quoteId),actor.id]);
          saved=r.rows[0]?.quote;
        }
        let tariff:Policy;
        if(saved?.farePolicy){
          tariff=policy(saved.policyId,saved.request.zone,{...saved.farePolicy,currency:saved.currency},1);
        } else {
          const r=await tx.query<{revision:string;payload:Record<string,unknown>;valid_until:Date}>(
            'SELECT * FROM khedmah_taxi.read_tariff_locked($1)',[zone]);
          const row=r.rows[0];
          if(!row || !(row.valid_until instanceof Date)) fail('TARIFF_UNAVAILABLE',503,'التعرفة المعتمدة غير متاحة.');
          const ttl=row.payload.quoteTtlMs;
          if(!Number.isSafeInteger(ttl)||Number(ttl)<1||Number(ttl)>3600000) fail('TARIFF_UNAVAILABLE',503,'مدة عرض السعر غير صالحة.');
          tariff=policy(`${zone}:${row.revision}`,zone,row.payload,Math.min(Number(ttl),Math.max(1,row.valid_until.getTime()-clock())));
          ctx.deadline=Math.min(ctx.deadline,row.valid_until.getTime());
        }
        return {policy:tariff,menu:[],restaurants:[],providers:actor.role==='driver'?[{
          id:actor.id,role:'driver',active:true,verified:true,zone:ctx.actor.zone!,kinds:['taxi']
        }]:[]};
      }},
      clock,nextId:randomUUID,route,
      assignment:(tx,actor)=>{
        const a=assertContext(tx,actor).actor;
        return a.role==='driver'?{vehicleId:a.vehicleId!,driverRevision:a.driverRevision!,vehicleRevision:a.vehicleRevision!}:undefined;
      },
      validateQuote:async(tx,_actor,quote)=>{
        const r=await route(tx,quote.request.pickup,quote.request.dropoff!);
        if(!quote.routeReference || r.reference.id!==quote.routeReference.id || r.reference.revision!==quote.routeReference.revision
          || r.reference.source!==quote.routeReference.source || r.distanceMeters!==quote.distanceMeters)
          fail('ROUTE_CHANGED',409,'تغيّر المسار المعتمد؛ أعد التسعير.');
      }
    });
    try { return await execute(engine,token??''); }
    catch(error){
      if(error instanceof JourneyError) throw new HttpException({code:error.code,message:error.message},error.status);
      if(error instanceof HttpException) throw error;
      const code=(error as {code?:string})?.code;
      if(code==='23505') throw new HttpException({code:'CONCURRENT_CONFLICT',message:'تعارض متزامن؛ أعد تحميل الرحلة.'},409);
      if(['PT503','PT409','3F000','42P01','42883','42501','55P03','57014','40P01','40001'].includes(code??''))
        throw new ServiceUnavailableException('Taxi references or storage are temporarily unavailable.');
      throw new HttpException({code:'TAXI_OPERATION_FAILED',message:'تعذر إكمال العملية؛ استعد حالتها قبل إعادة المحاولة.'},500);
    }
  }
  quote(token:string|undefined,body:unknown){return this.run(token,'customer','quote',body,undefined,(e,s)=>e.quote(s,body));}
  place(token:string|undefined,body:unknown){return this.run(token,'customer','place',body,undefined,(e,s)=>e.place(s,body));}
  read(token:string|undefined,audience:TaxiAudience,orderId:string){return this.run(token,audience,'read',undefined,orderId,(e,s)=>e.read(s,orderId));}
  command(token:string|undefined,audience:TaxiAudience,orderId:string,body:unknown){return this.run(token,audience,'command',body,orderId,(e,s)=>e.command(s,orderId,body));}
  consent(token:string|undefined,orderId:string,body:unknown){return this.run(token,'customer','consent',body,orderId,(e,s)=>e.consent(s,orderId,body));}
  authorization(token:string|undefined,orderId:string){return this.run(token,'driver','authorization',undefined,orderId,(e,s)=>e.authorization(s,orderId));}
  offers(token:string|undefined){return this.run(token,'driver','offers',undefined,undefined,(e,s)=>e.offers(s));}
}
