import { JourneyService, JourneyError, type Actor, type DatabaseState, type Order, type Quote, type TrustedEvidence } from '../domain.js';
import type { SqlClient, ReferenceSnapshot } from './ports.js';
import { fail, id, only, requestKey } from './input.js';
import { taxiQuoteInput, taxiCommandInput as commandInput, taxiRequiresProof as requiresProof, type TaxiPorts, type TaxiCommand } from './taxi-input.js';

type Receipt = {fingerprint:string; orderId:string};
type Row = { payload:unknown; archived?:unknown };
const decode=<T>(v:unknown):T => (typeof v==='string' ? JSON.parse(v) : structuredClone(v)) as T;
const blank=():DatabaseState=>({quotes:Object.create(null),orders:Object.create(null),receipts:Object.create(null),consumedQuotes:Object.create(null),events:[]});
const receiptScope=(a:Actor,op:string,key:string)=>JSON.stringify(op==='place'?['place',a.id,key]:['command',a.id,a.role,key]);

/** Persistent Taxi candidate; not yet mounted in the platform. Reuses the tested journey state machine inside a single,
 * scoped SQL transaction; never loads or globally locks the entire database.
 * The SQLite adapter is test/local-only. Production requires the PostgreSQL adapter
 * AND implementations of the canonical identity/reference ports. */
export class PersistentTaxiService {
  constructor(private readonly ports:TaxiPorts) {}
  private lock(){return this.ports.db.dialect==='postgres'?' FOR UPDATE':'';}
  private async serial(tx:SqlClient,scope:string){
    if(this.ports.db.dialect==='postgres') await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[scope]);
  }
  private async actor(tx:SqlClient,session:string){
    if(typeof session!=='string'||session.length<16||session.length>1024) fail('UNAUTHORIZED',401,'يلزم تسجيل الدخول.');
    const actor=await this.ports.identity.resolveLocked(tx,session);
    if(!actor||!['customer','driver','operator'].includes(actor.role)) fail('FORBIDDEN',403,'الدور غير مخول في التكسي.');
    id(actor.id);return actor;
  }
  private engine(state:DatabaseState,refs:ReferenceSnapshot){
    return new JourneyService({store:{transaction:async work=>work(state)},clock:this.ports.clock,nextId:this.ports.nextId,
      policy:()=>refs.policy,menu:()=>refs.menu,providers:()=>refs.providers});
  }
  private async loadReceipt(tx:SqlClient,state:DatabaseState,key:string){
    const [r]=(await tx.query<{fingerprint:string;order_id:string}>('SELECT fingerprint,order_id FROM jt_receipts WHERE scope_key=$1',[key])).rows;
    if(r) state.receipts[key]={fingerprint:r.fingerprint,orderId:r.order_id};
  }
  private async loadOrder(tx:SqlClient,state:DatabaseState,orderId:string,lock=true){
    const [r]=(await tx.query<Row>(`SELECT payload,archived FROM jt_orders WHERE id=$1${lock?this.lock():''}`,[orderId])).rows;
    // PostgreSQL int8 uses text by default; '0' is truthy in JavaScript.
    // Accept only the explicit active values, not null, missing or coercible data.
    if(r && (r.archived === 0 || r.archived === '0')){const o=decode<Order>(r.payload);if(o.kind!=='taxi') fail('NOT_FOUND',404,'الطلب غير متاح.');state.orders[o.id]=o;}
  }
  private async loadQuote(tx:SqlClient,state:DatabaseState,quoteId:string,actor:Actor){
    const [r]=(await tx.query<Row & {consumed_order_id:string|null}>(`SELECT payload,consumed_order_id FROM jt_quotes WHERE id=$1 AND customer_id=$2${this.lock()}`,[quoteId,actor.id])).rows;
    if(r){state.quotes[quoteId]=decode<Quote>(r.payload);if(r.consumed_order_id){state.consumedQuotes[quoteId]=r.consumed_order_id;await this.loadOrder(tx,state,r.consumed_order_id);}}
  }
  private async persist(tx:SqlClient,before:DatabaseState,state:DatabaseState,command?:TaxiCommand){
    for(const q of Object.values(state.quotes)) if(!before.quotes[q.id]){
      await tx.query('INSERT INTO jt_quotes(id,customer_id,expires_at_ms,payload) VALUES($1,$2,$3,$4)',[q.id,q.customerId,q.expiresAt,JSON.stringify(q)]);
    }
    for(const o of Object.values(state.orders)){
      const previous=before.orders[o.id];
      if(previous && JSON.stringify(previous)===JSON.stringify(o)) continue;
      const values=[o.id,o.quote.id,o.customerId,o.merchantId??null,o.delivery.providerId??null,o.phase,o.delivery.state,o.version,JSON.stringify(o)];
      if(previous){
        const changed=await tx.query(`UPDATE jt_orders SET provider_id=$5,phase=$6,delivery_state=$7,version=$8,payload=$9
          WHERE id=$1 AND quote_id=$2 AND customer_id=$3 AND (merchant_id=$4 OR (merchant_id IS NULL AND $4 IS NULL)) AND version=$10 AND archived=0 RETURNING id`,[...values,previous.version]);
        if(changed.rowCount!==1) fail('VERSION_CONFLICT',409,'تغيّر الطلب؛ أعد تحميل النسخة الحالية.');
      }else await tx.query('INSERT INTO jt_orders(id,quote_id,customer_id,merchant_id,provider_id,phase,delivery_state,version,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',values);
    }
    for(const [quoteId,orderId] of Object.entries(state.consumedQuotes)) if(!before.consumedQuotes[quoteId]){
      const used=await tx.query('UPDATE jt_quotes SET consumed_order_id=$2 WHERE id=$1 AND consumed_order_id IS NULL RETURNING id',[quoteId,orderId]);
      if(used.rowCount!==1) fail('QUOTE_CONSUMED',409,'عرض السعر مستخدم لطلب آخر.');
    }
    for(const [scope,r] of Object.entries(state.receipts)) if(!before.receipts[scope]){
      await tx.query('INSERT INTO jt_receipts(scope_key,fingerprint,order_id) VALUES($1,$2,$3)',[scope,r.fingerprint,r.orderId]);
    }
    for(const e of state.events){
      const details:Record<string,unknown>={};
      for(const k of ['reason','issueId','amountMinor','rating','proofId'] as const) if(command?.[k]!==undefined) details[k]=command[k];
      await tx.query('INSERT INTO jt_events(id,order_id,version,actor_id,action,occurred_at_ms,details) VALUES($1,$2,$3,$4,$5,$6,$7)',[e.id,e.orderId,e.version,e.actorId,e.action,e.occurredAt,JSON.stringify(details)]);
      // Notification payload deliberately excludes addresses, notes, names and customer IDs.
      await tx.query('INSERT INTO jt_outbox(event_id,payload,next_attempt_ms) VALUES($1,$2,$3)',[e.id,JSON.stringify({eventId:e.id,orderId:e.orderId,version:e.version,action:e.action}),e.occurredAt]);
      if(e.action==='record_cash'||e.action==='settle_cash'){
        const o=state.orders[e.orderId]!;
        await tx.query('INSERT INTO jt_cash_receipts(event_id,order_id,actor_id,entry_type,amount_minor,currency,occurred_at_ms) VALUES($1,$2,$3,$4,$5,$6,$7)',
          [e.id,e.orderId,e.actorId,e.action==='record_cash'?'collection':'settlement',o.cash.collectedMinor,o.quote.currency,e.occurredAt]);
      }
    }
  }
  async quote(session:string,body:unknown):Promise<Quote>{
    const input=taxiQuoteInput(body);
    return this.ports.db.transaction(async tx=>{
      const actor=await this.actor(tx,session);
      if(actor.role!=='customer') fail('FORBIDDEN',403,'التسعير مخصص للراكب.');
      const refs=await this.ports.references.readLocked(tx,actor);
      const route=await this.ports.route(tx,input.pickup,input.dropoff,refs);
      const state=blank(),before=structuredClone(state);
      const result=await this.engine(state,refs).quote(actor,{kind:'taxi',zone:refs.policy.zone,...input},route);
      if(route.reference){
        result.routeReference=structuredClone(route.reference);
        result.expiresAt=Math.min(result.expiresAt,route.reference.expiresAt);
      }
      await this.persist(tx,before,state);return result;
    });
  }
  async place(session:string,body:unknown):Promise<Order>{
    const input=only(body,['quoteId','requestId']);const quoteId=id(input.quoteId),key=requestKey(input.requestId);
    return this.ports.db.transaction(async tx=>{
      const actor=await this.actor(tx,session);
      if(actor.role!=='customer') fail('FORBIDDEN',403,'إنشاء الطلب مخصص للعميل.');
      const receiptKey=receiptScope(actor,'place',key);await this.serial(tx,receiptKey);
      const refs=await this.ports.references.readLocked(tx,actor);
      const state=blank();await this.loadReceipt(tx,state,receiptKey);
      await this.loadQuote(tx,state,quoteId,actor);
      // A conflicting retained receipt must not load another customer's order.
      const retained=state.receipts[receiptKey];
      if(retained && retained.fingerprint===quoteId && !state.orders[retained.orderId]) await this.loadOrder(tx,state,retained.orderId);
      if(!retained && !state.consumedQuotes[quoteId] && state.quotes[quoteId])
        await this.ports.validateQuote?.(tx,actor,state.quotes[quoteId]);
      const before=structuredClone(state), result=await this.engine(state,refs).place(actor,quoteId,key);
      if(result.customerId!==actor.id) fail('NOT_FOUND',404,'الطلب غير متاح.');
      await this.persist(tx,before,state);
      // Persistence/outbox waits can cross the quote deadline. An uncertain
      // response for an already committed placement must still remain replayable.
      if(!before.consumedQuotes[quoteId] && state.consumedQuotes[quoteId]
        && result.quote.expiresAt <= this.ports.clock())
        fail('QUOTE_EXPIRED',409,'انتهت صلاحية عرض السعر؛ أعد التسعير.');
      return result;
    });
  }
  async command(session:string,orderId:string,body:unknown):Promise<Order>{
    id(orderId);const command=commandInput(body);
    return this.ports.db.transaction(async tx=>{
      const actor=await this.actor(tx,session),receiptKey=receiptScope(actor,'command',command.requestId);
      await this.serial(tx,receiptKey);
      // Capacity lock precedes the target row. Different customers/orders are not globally serialized.
      if(actor.role==='driver') await this.serial(tx,`capacity:${actor.id}`);
      const refs=await this.ports.references.readLocked(tx,actor),state=blank();
      await this.loadReceipt(tx,state,receiptKey);await this.loadOrder(tx,state,orderId);
      if(command.action==='accept_job'){
        const active=(await tx.query<Row>(`SELECT payload FROM jt_orders WHERE provider_id=$1 AND archived=0
          AND phase NOT IN ('completed','cancelled','rejected') AND delivery_state NOT IN ('delivered','cancelled')`,[actor.id])).rows;
        for(const row of active){const o=decode<Order>(row.payload);if(o.id!==orderId)state.orders[o.id]=o;}
      }
      const before=structuredClone(state),engine=this.engine(state,refs);
      // Check access before looking up a proof or revealing whether it exists.
      if(command.action!=='accept_job') await engine.read(actor,orderId);
      const assignment=this.ports.assignment?.(tx,actor), current=state.orders[orderId];
      if(actor.role==='driver' && current?.taxiAssignment && command.action!=='accept_job'
        && command.action!=='report_issue' && command.action!=='release_job'
        && (['vehicleId','driverRevision','vehicleRevision'] as const).some(key=>current.taxiAssignment![key]!==assignment?.[key]))
        fail('ASSIGNMENT_CHANGED',409,'تغير اعتماد السائق أو المركبة؛ تلزم مراجعة التشغيل.');
      let evidence:TrustedEvidence={};let proofId:string|undefined;
      // Only passenger consent is writable by this API. Arrival/meter rows are supplied by a separate trusted writer.
      const proofTable=command.action==='start_ride'?'jt_ride_consents':'jt_evidence';
      if(requiresProof(command.action)&&!state.receipts[receiptKey]){
        const [proof]=(await tx.query<{id:string;order_id:string;actor_id:string;action:string;expected_version:number;expires_at_ms:number;consumed_event_id:string|null;source:string;payload:unknown}>(
          `SELECT id,order_id,actor_id,action,expected_version,expires_at_ms,consumed_event_id,source,payload FROM ${proofTable} WHERE id=$1${this.lock()}`,[command.proofId])).rows;
        if(!proof||proof.order_id!==orderId||proof.actor_id!==actor.id||proof.action!==command.action||Number(proof.expected_version)!==command.expectedVersion
          ||Number(proof.expires_at_ms)<=this.ports.clock()||proof.consumed_event_id||!proof.source) fail(command.action==='start_ride'?'CONSENT_REQUIRED':'PROOF_INVALID',409,'الإثبات غير صالح لهذه العملية أو انتهت صلاحيته.');
        proofId=proof.id;
        const data=decode<Record<string,unknown>>(proof.payload),order=state.orders[orderId]!;
        if(order.taxiAssignment && command.action!=='start_ride'){
          const a=order.taxiAssignment;
          if(data.vehicleId!==a.vehicleId || data.driverRevision!==a.driverRevision || data.vehicleRevision!==a.vehicleRevision
            || !Number.isSafeInteger(data.observedAt) || Number(data.observedAt)>this.ports.clock()
            || this.ports.clock()-Number(data.observedAt)>30000)
            fail('PROOF_INVALID',409,'الإثبات لا يطابق المركبة أو اعتماد الرحلة الحالي.');
        }
        if(command.action==='arrive_pickup') evidence={arrivalVerified:true};
        if(command.action==='start_ride'){
          if(proof.source!=='authenticated-rider-consent' || data.customerId!==order.customerId)
            fail('CONSENT_REQUIRED',409,'يلزم تأكيد الراكب من حسابه.');
          evidence={rideConsentVerified:true};
        }
        if(command.action==='finish_ride'){
          const observed=Number(data.observedAt),started=order.rideStartedAt;
          if(!order.rideStartEventId || started===undefined || data.startEventId!==order.rideStartEventId
            || !Number.isSafeInteger(data.observedAt) || observed<started || observed>this.ports.clock()
            || this.ports.clock()-observed>30000 || !Number.isSafeInteger(data.tripMeters) || Number(data.tripMeters)<0 || Number(data.tripMeters)>500000
            || !Number.isSafeInteger(data.waitSeconds) || Number(data.waitSeconds)<0
            || Number(data.waitSeconds)>Math.floor((observed-started)/1000))
            fail('METER_INVALID',409,'القياس قديم أو لا يخص بداية هذه الرحلة.');
          evidence={meterVerified:true,dropoffVerified:true,tripMeters:Number(data.tripMeters),waitSeconds:Number(data.waitSeconds)};
        }
      }
      const result=await engine.command(actor,orderId,command,evidence);
      if(state.events.length && command.action==='accept_job' && assignment) result.taxiAssignment=structuredClone(assignment);
      if(state.events.length && command.action==='release_job') delete result.taxiAssignment;
      await this.persist(tx,before,state,command);
      if(proofId){
        const eventId=`${result.id}:${result.version}`;
        // Recheck after aggregate/event/outbox persistence, not just at the
        // initial proof read. Any expiry rolls back the entire transaction.
        const consumed=await tx.query(`UPDATE ${proofTable} SET consumed_event_id=$2
          WHERE id=$1 AND consumed_event_id IS NULL AND expires_at_ms>$3 RETURNING id`,
          [proofId,eventId,this.ports.clock()]);
        if(consumed.rowCount!==1) fail('PROOF_INVALID',409,'انتهت صلاحية الإثبات أو تم استخدامه.');
      }
      return result;
    });
  }
  async read(session:string,orderId:string):Promise<Order>{
    id(orderId);return this.ports.db.transaction(async tx=>{
      const actor=await this.actor(tx,session),refs=await this.ports.references.readLocked(tx,actor),state=blank();
      await this.loadOrder(tx,state,orderId,false);return this.engine(state,refs).read(actor,orderId);
    });
  }
  /** Passenger-authenticated consent, scoped to exactly this assigned driver/version.
   * No browser can mint arrival/meter evidence. Consent does not start charging. */
  async consent(session:string,orderId:string,body:unknown){
    id(orderId);const v=only(body,['expectedVersion']);
    if(!Number.isSafeInteger(v.expectedVersion) || Number(v.expectedVersion)<1) fail('INVALID_VERSION',400,'نسخة الرحلة غير صالحة.');
    return this.ports.db.transaction(async tx=>{
      const actor=await this.actor(tx,session),refs=await this.ports.references.readLocked(tx,actor),state=blank();
      await this.loadOrder(tx,state,orderId);
      const order=await this.engine(state,refs).read(actor,orderId);
      if(actor.role!=='customer'||order.customerId!==actor.id) fail('FORBIDDEN',403,'الموافقة للراكب فقط.');
      if(order.version!==v.expectedVersion) fail('VERSION_CONFLICT',409,'تغيرت الرحلة؛ أعد تحميلها.');
      if(order.phase!=='accepted'||order.delivery.state!=='at_pickup'||!order.delivery.providerId) fail('INVALID_TRANSITION',409,'لم يصل السائق بعد.');
      const [existing]=(await tx.query<{id:string}>(`SELECT id FROM jt_ride_consents WHERE order_id=$1 AND action='start_ride'
        AND actor_id=$2 AND expected_version=$3 AND expires_at_ms>$4 AND source='authenticated-rider-consent'
        AND consumed_event_id IS NULL ORDER BY id LIMIT 1`,
        [order.id,order.delivery.providerId,order.version,this.ports.clock()])).rows;
      if(existing)return {proofId:existing.id,orderId:order.id,version:order.version};
      const proofId=this.ports.nextId();
      await tx.query(`INSERT INTO jt_ride_consents(id,order_id,actor_id,action,expected_version,expires_at_ms,source,payload)
        VALUES($1,$2,$3,'start_ride',$4,$5,'authenticated-rider-consent',$6)`,
        [proofId,order.id,order.delivery.providerId,order.version,this.ports.clock()+120000,JSON.stringify({customerId:actor.id})]);
      return {proofId,orderId:order.id,version:order.version};
    });
  }
  async authorization(session:string,orderId:string){
    id(orderId);return this.ports.db.transaction(async tx=>{
      const actor=await this.actor(tx,session),refs=await this.ports.references.readLocked(tx,actor),state=blank();
      await this.loadOrder(tx,state,orderId);
      const order=await this.engine(state,refs).read(actor,orderId);
      if(actor.role!=='driver'||order.delivery.providerId!==actor.id) fail('FORBIDDEN',403,'التصريح للسائق المسند فقط.');
      const [proof]=(await tx.query<{id:string}>(`SELECT id FROM jt_ride_consents WHERE order_id=$1 AND actor_id=$2
        AND action='start_ride' AND source='authenticated-rider-consent' AND expected_version=$3
        AND expires_at_ms>$4 AND consumed_event_id IS NULL ORDER BY id LIMIT 1`,[orderId,actor.id,order.version,this.ports.clock()])).rows;
      return {proofId:proof?.id??null,orderId,version:order.version};
    });
  }
  async offers(session:string){
    return this.ports.db.transaction(async tx=>{
      const actor=await this.actor(tx,session),refs=await this.ports.references.readLocked(tx,actor);
      if(actor.role!=='driver') fail('FORBIDDEN',403,'العروض للسائقين فقط.');
      const provider=refs.providers.find(p=>p.id===actor.id&&p.role==='driver'&&p.active&&p.verified&&p.kinds.includes('taxi'));
      if(!provider)return {offers:[],limit:100};
      const zone=this.ports.db.dialect==='postgres'?"payload->'quote'->'request'->>'zone'":"json_extract(payload,'$.quote.request.zone')";
      const state=blank(),rows=(await tx.query<Row>(`SELECT payload FROM jt_orders WHERE archived=0 AND phase='submitted'
        AND delivery_state='requested' AND ${zone}=$1 ORDER BY id LIMIT 100`,[provider.zone])).rows;
      for(const r of rows){const order=decode<Order>(r.payload);state.orders[order.id]=order;}
      return {offers:await this.engine(state,refs).offers(actor),limit:100};
    });
  }
}
