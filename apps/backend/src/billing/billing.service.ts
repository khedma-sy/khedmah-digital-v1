import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabasePool } from '../database/database.pool';
import { IdentityRepository } from '../identity/identity.repository';
import { IdentityService } from '../identity/identity.service';

export const BILLING_CURRENCY='SYP' as const;
export const BILLING_CURRENCY_ERA='SYP_NEW_2026' as const;

type PlanRow=Record<string,unknown>&{code:string;family:string;name_ar:string;billing_cycle:'monthly'|'annual';duration_months:number;price_minor:string|number;currency:string;currency_era:string;points_granted:string|number;features:unknown;published:boolean;sort_order:number};
type PromoRow=Record<string,unknown>&{code:string;percentage_off:number;message_ar:string;active:boolean;valid_from:Date;valid_until:Date;max_redemptions:number|null;per_user_limit:number};
type OrderRow=Record<string,unknown>&{id:string;user_id:string;request_key:string;plan_code:string;amount_minor:string|number;discount_minor:string|number;total_minor:string|number;currency:string;currency_era:string;promo_code:string|null;status:'pending'|'paid'|'cancelled'|'expired';external_reference:string|null;created_at:Date;paid_at:Date|null};

function asObject(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new BadRequestException('Billing payload is invalid.');return value as Record<string,unknown>;}
function text(value:unknown,field:string,min=1,max=100){if(typeof value!=='string')throw new BadRequestException(`${field} is invalid.`);const v=value.trim();if(v.length<min||v.length>max)throw new BadRequestException(`${field} is invalid.`);return v;}
function requestKey(value:unknown){const v=text(value,'requestId',16,100);if(!/^[A-Za-z0-9_-]+$/.test(v))throw new BadRequestException('requestId is invalid.');return v;}
function promoCode(value:unknown){if(value===undefined||value===null||value==='')return undefined;const v=text(value,'promoCode',4,32).toUpperCase();if(!/^[A-Z0-9_-]+$/.test(v))throw new BadRequestException('promoCode is invalid.');return v;}
function confirmedTotal(value:unknown){if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)throw new BadRequestException('confirmedTotalMinor is invalid.');return value;}
function mapPlan(row:PlanRow){return {code:row.code,family:row.family,nameAr:row.name_ar,billingCycle:row.billing_cycle,durationMonths:row.duration_months,priceMinor:Number(row.price_minor),currency:BILLING_CURRENCY,currencyEra:BILLING_CURRENCY_ERA,pointsGranted:Number(row.points_granted),features:Array.isArray(row.features)?row.features:[],sortOrder:row.sort_order};}
function mapOrder(row:OrderRow){return {id:row.id,planCode:row.plan_code,amountMinor:Number(row.amount_minor),discountMinor:Number(row.discount_minor),totalMinor:Number(row.total_minor),currency:BILLING_CURRENCY,currencyEra:BILLING_CURRENCY_ERA,promoCode:row.promo_code??undefined,status:row.status,externalReference:row.external_reference??undefined,createdAt:row.created_at.toISOString(),paidAt:row.paid_at?.toISOString()};}

@Injectable()
export class BillingService{
  constructor(@Inject(DatabasePool) private readonly db:DatabasePool,@Inject(IdentityService) private readonly identity:IdentityService,@Inject(IdentityRepository) private readonly identities:IdentityRepository){}

  async plans(){const rows=await this.db.query<PlanRow>(`SELECT * FROM billing_plans WHERE published=true ORDER BY sort_order,code`);return {plans:rows.map(mapPlan)};}
  private async user(token:string|undefined){return this.identity.getCurrentUser(token);}
  private async requireBillingAdmin(token:string|undefined){const user=await this.user(token);const roles=await this.identities.findAdminRoles(user.id);if(!roles.some(r=>r==='bootstrap_admin'||r==='billing_admin'))throw new ForbiddenException('Billing administration access denied.');return user;}

  async activePromo(token:string|undefined){
    const user=await this.user(token);
    const rows=await this.db.query<PromoRow>(`SELECT * FROM billing_promo_codes WHERE active=true AND valid_from<=NOW() AND valid_until>NOW() ORDER BY valid_until,code LIMIT 1`);
    const promo=rows[0];if(!promo)return {promotion:null};
    const used=await this.db.query<{count:string}&Record<string,unknown>>(`SELECT count(*)::text count FROM billing_promo_redemptions WHERE user_id=$1 AND promo_code=$2`,[user.id,promo.code]);
    const total=promo.max_redemptions===null?0:Number((await this.db.query<{count:string}>(`SELECT count(*)::text count FROM billing_promo_redemptions WHERE promo_code=$1`,[promo.code]))[0]?.count??0);
    return {promotion:{code:promo.code,percentageOff:promo.percentage_off,messageAr:promo.message_ar,validUntil:promo.valid_until.toISOString(),eligible:Number(used[0]?.count??0)<promo.per_user_limit&&(promo.max_redemptions===null||total<promo.max_redemptions)}};
  }

  async me(token:string|undefined){
    const user=await this.user(token);
    const balance=await this.db.query<{points:string}&Record<string,unknown>>(`SELECT COALESCE(sum(points_remaining),0)::text points FROM billing_credit_grants WHERE user_id=$1 AND effective_at<=NOW() AND (expires_at IS NULL OR expires_at>NOW())`,[user.id]);
    const grants=await this.db.query<Record<string,unknown>&{id:string;category:string;points_granted:string;points_remaining:string;expires_at:Date|null;created_at:Date}>(`SELECT id,category,points_granted::text,points_remaining::text,expires_at,created_at FROM billing_credit_grants WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,[user.id]);
    const subscriptions=await this.db.query<Record<string,unknown>&{id:string;plan_code:string;status:string;period_start:Date;period_end:Date}>(`SELECT id,plan_code,status,period_start,period_end FROM billing_subscriptions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10`,[user.id]);
    const orders=await this.db.query<OrderRow>(`SELECT * FROM billing_purchase_orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`,[user.id]);
    return {billing:{pointsAvailable:Number(balance[0]?.points??0),currency:BILLING_CURRENCY,currencyEra:BILLING_CURRENCY_ERA,grants:grants.map(g=>({id:g.id,category:g.category,pointsGranted:Number(g.points_granted),pointsRemaining:Number(g.points_remaining),expiresAt:g.expires_at?.toISOString(),createdAt:g.created_at.toISOString()})),subscriptions:subscriptions.map(s=>({id:s.id,planCode:s.plan_code,status:s.status,periodStart:s.period_start.toISOString(),periodEnd:s.period_end.toISOString()})),orders:orders.map(mapOrder)}};
  }

  private async quoteFor(userId:string,planCodeValue:unknown,promoValue:unknown,client:DatabasePool|PoolClient=this.db){
    const planCode=text(planCodeValue,'planCode',3,50);
    const query=async<T extends Record<string,unknown>>(sql:string,params:unknown[])=>client instanceof DatabasePool?client.query<T>(sql,params):(await client.query<T>(sql,params)).rows;
    const plans=await query<PlanRow>(`SELECT * FROM billing_plans WHERE code=$1 AND published=true`,[planCode]);
    const plan=plans[0];if(!plan)throw new NotFoundException('Billing plan was not found.');
    let discount=0;let promotion:PromoRow|undefined;const code=promoCode(promoValue);
    if(code){const promos=await query<PromoRow>(`SELECT * FROM billing_promo_codes WHERE code=$1 AND active=true AND valid_from<=NOW() AND valid_until>NOW()`,[code]);promotion=promos[0];if(!promotion)throw new BadRequestException('Promo code is invalid or expired.');const used=await query<{count:string}&Record<string,unknown>>(`SELECT count(*)::text count FROM billing_promo_redemptions WHERE user_id=$1 AND promo_code=$2`,[userId,code]);if(Number(used[0]?.count??0)>=promotion.per_user_limit)throw new ConflictException('Promo code was already used by this account.');if(promotion.max_redemptions!==null){const total=await query<{count:string}>(`SELECT count(*)::text count FROM billing_promo_redemptions WHERE promo_code=$1`,[code]);if(Number(total[0]?.count??0)>=promotion.max_redemptions)throw new ConflictException('Promo code redemption limit was reached.');}discount=Math.floor(Number(plan.price_minor)*promotion.percentage_off/100);}
    return {plan:mapPlan(plan),promo:promotion?{code:promotion.code,percentageOff:promotion.percentage_off,messageAr:promotion.message_ar}:undefined,amountMinor:Number(plan.price_minor),discountMinor:discount,totalMinor:Number(plan.price_minor)-discount,currency:BILLING_CURRENCY,currencyEra:BILLING_CURRENCY_ERA};
  }

  async quote(token:string|undefined,value:unknown){const user=await this.user(token);const body=asObject(value);return this.quoteFor(user.id,body.planCode,body.promoCode);}

  async createOrder(token:string|undefined,value:unknown){
    const user=await this.user(token);const body=asObject(value);const key=requestKey(body.requestId);const planCode=text(body.planCode,'planCode',3,50);const code=promoCode(body.promoCode);
    return this.db.transaction(async client=>{
      // A row lock cannot serialize retries before the first order exists.
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,[`billing-request:${user.id}:${key}`]);
      const replay=await client.query<OrderRow>(`SELECT * FROM billing_purchase_orders WHERE user_id=$1 AND request_key=$2 FOR UPDATE`,[user.id,key]);
      if(replay.rows[0]){const existing=replay.rows[0];if(existing.plan_code!==planCode||(existing.promo_code??undefined)!==code)throw new ConflictException('requestId belongs to another billing order.');return {order:mapOrder(existing)};}
      const q=await this.quoteFor(user.id,planCode,code,client);const id=randomUUID();
      if(body.expectedTotalMinor!==undefined && body.expectedTotalMinor!==q.totalMinor)throw new ConflictException('The quoted total changed. Review the price again.');
      const inserted=await client.query<OrderRow>(`INSERT INTO billing_purchase_orders(id,user_id,request_key,plan_code,amount_minor,discount_minor,total_minor,currency,currency_era,promo_code) VALUES($1,$2,$3,$4,$5,$6,$7,'SYP','SYP_NEW_2026',$8) RETURNING *`,[id,user.id,key,planCode,q.amountMinor,q.discountMinor,q.totalMinor,code??null]);
      return {order:mapOrder(inserted.rows[0]),quote:q};
    });
  }

  async pendingOrders(token:string|undefined){await this.requireBillingAdmin(token);const rows=await this.db.query<OrderRow>(`SELECT * FROM billing_purchase_orders WHERE status='pending' ORDER BY created_at LIMIT 200`);return {orders:rows.map(mapOrder)};}

  async cancelOrder(token:string|undefined,orderIdValue:unknown){
    const user=await this.user(token),id=text(orderIdValue,'orderId',1,100);
    return this.db.transaction(async client=>{
      const found=await client.query<OrderRow>(`SELECT * FROM billing_purchase_orders WHERE id=$1 AND user_id=$2 FOR UPDATE`,[id,user.id]);
      const order=found.rows[0];if(!order)throw new NotFoundException('Billing order was not found.');
      if(order.status==='cancelled')return {order:mapOrder(order)};
      if(order.status!=='pending')throw new ConflictException('Only pending billing orders can be cancelled.');
      const result=await client.query<OrderRow>(`UPDATE billing_purchase_orders SET status='cancelled' WHERE id=$1 RETURNING *`,[id]);
      return {order:mapOrder(result.rows[0])};
    });
  }

  async markPaid(token:string|undefined,orderIdValue:unknown,value:unknown){
    const admin=await this.requireBillingAdmin(token);const orderId=text(orderIdValue,'orderId',1,100);const body=asObject(value);const externalReference=text(body.externalReference,'externalReference',4,100);
    if(body.attested!==true)throw new BadRequestException('Manual payment review attestation is required.');
    const reviewedTotal=confirmedTotal(body.confirmedTotalMinor),reviewedCurrency=text(body.confirmedCurrency,'confirmedCurrency',3,3),reviewedCurrencyEra=text(body.confirmedCurrencyEra,'confirmedCurrencyEra',3,32);
    return this.db.transaction(async client=>{
      const result=await client.query<OrderRow&{duration_months:number;points_granted:string}>(`SELECT o.*,p.duration_months,p.points_granted::text FROM billing_purchase_orders o JOIN billing_plans p ON p.code=o.plan_code WHERE o.id=$1 FOR UPDATE OF o`,[orderId]);
      const order=result.rows[0];if(!order)throw new NotFoundException('Billing order was not found.');
      if(order.user_id===admin.id)throw new ForbiddenException('Payment must be confirmed by a separate billing administrator.');
      if(Number(order.total_minor)!==reviewedTotal||order.currency!==reviewedCurrency||order.currency_era!==reviewedCurrencyEra)throw new ConflictException('Confirmed payment amount or currency does not match this billing order.');
      if(order.status==='paid'){
        if(order.external_reference!==externalReference)throw new ConflictException('This order was confirmed with a different payment reference.');
        const existing=await client.query<Record<string,unknown>&{id:string;plan_code:string;period_start:Date;period_end:Date}>(`SELECT id,plan_code,period_start,period_end FROM billing_subscriptions WHERE purchase_order_id=$1`,[order.id]);return {order:mapOrder(order),subscription:existing.rows[0]};
      }
      if(order.status!=='pending')throw new ConflictException('Billing order cannot be paid in its current state.');
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,[`billing-reference:${externalReference}`]);
      const duplicate=await client.query<{id:string}>(`SELECT id FROM billing_purchase_orders WHERE external_reference=$1 AND status='paid' AND id<>$2`,[externalReference,order.id]);
      if(duplicate.rows.length)throw new ConflictException('This payment reference already belongs to another order.');
      if(order.promo_code){const p=await client.query<PromoRow>(`SELECT * FROM billing_promo_codes WHERE code=$1 FOR UPDATE`,[order.promo_code]);const promo=p.rows[0];if(!promo||!promo.active||promo.valid_from>new Date()||promo.valid_until<=new Date())throw new ConflictException('Promo code expired before payment confirmation.');const total=await client.query<{count:string}>(`SELECT count(*)::text count FROM billing_promo_redemptions WHERE promo_code=$1`,[promo.code]);if(promo.max_redemptions!==null&&Number(total.rows[0]?.count??0)>=promo.max_redemptions)throw new ConflictException('Promo code redemption limit was reached.');const userCount=await client.query<{count:string}>(`SELECT count(*)::text count FROM billing_promo_redemptions WHERE promo_code=$1 AND user_id=$2`,[promo.code,order.user_id]);if(Number(userCount.rows[0]?.count??0)>=promo.per_user_limit)throw new ConflictException('Promo code was already redeemed by this account.');}
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,[`billing:${order.user_id}`]);
      await client.query(`UPDATE billing_subscriptions SET status='superseded' WHERE user_id=$1 AND status='active'`,[order.user_id]);
      const subscriptionId=randomUUID();const sub=await client.query<Record<string,unknown>&{id:string;plan_code:string;period_start:Date;period_end:Date}>(`INSERT INTO billing_subscriptions(id,user_id,plan_code,purchase_order_id,status,period_start,period_end) VALUES($1,$2,$3,$4,'active',NOW(),NOW()+make_interval(months=>$5)) RETURNING id,plan_code,period_start,period_end`,[subscriptionId,order.user_id,order.plan_code,order.id,order.duration_months]);
      const grantId=randomUUID(),points=Number(order.points_granted);await client.query(`INSERT INTO billing_credit_grants(id,user_id,grant_key,category,points_granted,points_remaining,effective_at,expires_at,source_ref) VALUES($1,$2,$3,'subscription',$4,$4,NOW(),$5,$6)`,[grantId,order.user_id,`subscription:${order.id}`,points,sub.rows[0].period_end,order.id]);
      await client.query(`INSERT INTO billing_credit_ledger(id,user_id,grant_id,entry_key,entry_type,points_delta,metadata) VALUES($1,$2,$3,$4,'grant',$5,$6)`,[randomUUID(),order.user_id,grantId,`grant:subscription:${order.id}`,points,JSON.stringify({planCode:order.plan_code,purchaseOrderId:order.id,confirmedBy:admin.id,externalReference,confirmationMode:'manual_review',confirmedTotalMinor:reviewedTotal,confirmedCurrency:reviewedCurrency,confirmedCurrencyEra:reviewedCurrencyEra})]);
      if(order.promo_code)await client.query(`INSERT INTO billing_promo_redemptions(id,promo_code,user_id,purchase_order_id,percentage_off) SELECT $1,p.code,$2,$3,p.percentage_off FROM billing_promo_codes p WHERE p.code=$4`,[randomUUID(),order.user_id,order.id,order.promo_code]);
      const paid=await client.query<OrderRow>(`UPDATE billing_purchase_orders SET status='paid',external_reference=$2,paid_at=NOW() WHERE id=$1 RETURNING *`,[order.id,externalReference]);
      return {order:mapOrder(paid.rows[0]),subscription:{id:sub.rows[0].id,planCode:sub.rows[0].plan_code,periodStart:sub.rows[0].period_start.toISOString(),periodEnd:sub.rows[0].period_end.toISOString()},grantedPoints:points,confirmedBy:admin.id};
    });
  }

  async consume(userId:string,featureCode:string,idempotencyKey:string){
    const feature=text(featureCode,'featureCode',3,64),key=requestKey(idempotencyKey);
    return this.db.transaction(async client=>{
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,[`billing:${userId}`]);
      const previous=await client.query<{points_consumed:string}>(`SELECT points_consumed::text FROM billing_usage_receipts WHERE user_id=$1 AND idempotency_key=$2`,[userId,key]);
      if(previous.rows[0])return {replayed:true,pointsConsumed:Number(previous.rows[0].points_consumed)};
      const rate=await client.query<{points_cost:string}>(`SELECT points_cost::text FROM billing_usage_rates WHERE feature_code=$1 AND active=true`,[feature]);if(!rate.rows[0])throw new NotFoundException('Usage rate was not found.');const cost=Number(rate.rows[0].points_cost);
      const grants=await client.query<Record<string,unknown>&{id:string;points_remaining:string}>(`SELECT id,points_remaining::text FROM billing_credit_grants WHERE user_id=$1 AND points_remaining>0 AND effective_at<=NOW() AND (expires_at IS NULL OR expires_at>NOW()) ORDER BY expires_at NULLS LAST,created_at FOR UPDATE`,[userId]);
      const total=grants.rows.reduce((s,g)=>s+Number(g.points_remaining),0);if(total<cost)throw new ConflictException('Insufficient points balance.');
      const receiptId=randomUUID();let remaining=cost;
      for(const grant of grants.rows){if(remaining<=0)break;const debit=Math.min(remaining,Number(grant.points_remaining));await client.query(`UPDATE billing_credit_grants SET points_remaining=points_remaining-$2 WHERE id=$1`,[grant.id,debit]);await client.query(`INSERT INTO billing_credit_ledger(id,user_id,grant_id,entry_key,entry_type,points_delta,feature_code,metadata) VALUES($1,$2,$3,$4,'consume',$5,$6,$7)`,[randomUUID(),userId,grant.id,`consume:${receiptId}:${grant.id}`,-debit,feature,JSON.stringify({idempotencyKey:key})]);remaining-=debit;}
      await client.query(`INSERT INTO billing_usage_receipts(id,user_id,idempotency_key,feature_code,points_consumed) VALUES($1,$2,$3,$4,$5)`,[receiptId,userId,key,feature,cost]);
      return {replayed:false,pointsConsumed:cost,pointsRemaining:total-cost};
    });
  }
}
