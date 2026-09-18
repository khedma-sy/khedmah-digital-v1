import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabasePool } from '../database/database.pool';
import { createTestPool, resetCanonicalTestSchema } from '../database/test-pool';
import { IdentityRepository } from '../identity/identity.repository';
import { BillingService } from './billing.service';

test('billing retries, manual review, role migration rollback and cancellation use real transactions', {timeout:30_000}, async()=>{
  const pool=createTestPool(),db=DatabasePool.fromPool(pool),identities=new IdentityRepository(db);
  const users=[randomUUID(),randomUUID()],admin=randomUUID(),outsider=randomUUID();
  const identity={getCurrentUser:async(token:string)=>({id:token,email:'fixture@example.test'})};
  const service=new BillingService(db,identity as never,identities);
  const review=(order:{totalMinor:number;currency:string;currencyEra:string},externalReference:string)=>({externalReference,attested:true,confirmedTotalMinor:order.totalMinor,confirmedCurrency:order.currency,confirmedCurrencyEra:order.currencyEra});
  try{
    await resetCanonicalTestSchema(pool);
    await pool.query(await readFile(resolve(__dirname,'../../../../backend/migrations/versions/030_billing_credits_subscriptions.sql'),'utf8'));
    await pool.query(await readFile(resolve(__dirname,'../../../../backend/migrations/versions/033_billing_admin_role.sql'),'utf8'));
    const now=new Date().toISOString();
    for(const id of [...users,admin,outsider])await identities.saveAccount({id,email:`${id}@example.test`,passwordHash:'nonlogin-fixture',status:'active',createdAt:now,updatedAt:now});
    await identities.saveAdminRole(admin,'billing_admin');await identities.saveAdminRole(users[0],'billing_admin');
    const quote=await service.quote(users[0],{planCode:'starter_monthly',promoCode:'khedma30'});
    assert.equal(quote.discountMinor,45000);assert.equal(quote.totalMinor,105000);
    const input={requestId:randomUUID(),planCode:'starter_monthly',promoCode:'KHEDMA30',expectedTotalMinor:105000};
    const retries=await Promise.all(Array.from({length:4},()=>service.createOrder(users[0],input)));
    assert.equal(new Set(retries.map(r=>r.order.id)).size,1);
    assert.equal((await pool.query('SELECT count(*)::int n FROM billing_purchase_orders')).rows[0].n,1);
    await assert.rejects(service.createOrder(users[0],{...input,planCode:'growth_monthly'}),/another billing order/);
    await assert.rejects(service.createOrder(users[0],{...input,requestId:randomUUID(),expectedTotalMinor:1}),/quoted total changed/);
    const other=await service.createOrder(users[1],{requestId:randomUUID(),planCode:'starter_monthly'});
    await assert.rejects(service.markPaid(outsider,retries[0].order.id,review(retries[0].order,'receipt-test-1')),/access denied/);
    await assert.rejects(service.markPaid(admin,retries[0].order.id,{...review(retries[0].order,'receipt-test-1'),attested:false}),/review attestation/);
    await assert.rejects(service.markPaid(admin,retries[0].order.id,{...review(retries[0].order,'receipt-test-1'),confirmedTotalMinor:1}),/amount or currency does not match/);
    await assert.rejects(service.markPaid(admin,retries[0].order.id,{...review(retries[0].order,'receipt-test-1'),confirmedCurrency:'USD'}),/amount or currency does not match/);
    await assert.rejects(service.markPaid(users[0],retries[0].order.id,review(retries[0].order,'receipt-test-1')),/separate billing administrator/);
    const candidates=[retries[0].order,other.order],ids=candidates.map(order=>order.id);
    const confirmations=await Promise.allSettled(candidates.map(order=>service.markPaid(admin,order.id,review(order,'receipt-test-1'))));
    assert.equal(confirmations.filter(r=>r.status==='fulfilled').length,1);
    const failure=confirmations.find(r=>r.status==='rejected');
    assert.ok(failure?.status==='rejected'&&/already belongs/.test(failure.reason.message));
    const paid=(await pool.query("SELECT id FROM billing_purchase_orders WHERE status='paid'")).rows[0].id;
    const pending=ids.find(id=>id!==paid)!;
    const paidOrder=candidates.find(order=>order.id===paid)!;
    await service.markPaid(admin,paid,review(paidOrder,'receipt-test-1'));
    await assert.rejects(service.markPaid(admin,paid,review(paidOrder,'different-receipt')),/different payment reference/);
    assert.equal((await pool.query("SELECT count(*)::int n FROM billing_credit_grants WHERE category='subscription'")).rows[0].n,1);
    const ledger=(await pool.query("SELECT metadata FROM billing_credit_ledger WHERE entry_type='grant'")).rows[0].metadata;
    assert.equal(ledger.confirmedBy,admin);assert.equal(ledger.externalReference,'receipt-test-1');assert.equal(ledger.confirmationMode,'manual_review');assert.equal(ledger.confirmedTotalMinor,paidOrder.totalMinor);assert.equal(ledger.confirmedCurrency,'SYP');assert.equal(ledger.confirmedCurrencyEra,'SYP_NEW_2026');
    const owner=(await pool.query('SELECT user_id FROM billing_purchase_orders WHERE id=$1',[pending])).rows[0].user_id;
    await assert.rejects(service.cancelOrder(admin,pending),/not found/);
    assert.equal((await service.cancelOrder(owner,pending)).order.status,'cancelled');
    assert.equal((await service.cancelOrder(owner,pending)).order.status,'cancelled');
    const pendingOrder=candidates.find(order=>order.id===pending)!;
    await assert.rejects(service.markPaid(admin,pending,review(pendingOrder,'receipt-test-2')),/current state/);
    await pool.query("UPDATE billing_promo_codes SET max_redemptions=1 WHERE code='KHEDMA30'");
    // Ensure a redemption exists regardless of which competing payment won.
    if(paid===other.order.id){
      const promoOrder=await service.createOrder(users[1],{requestId:randomUUID(),planCode:'starter_monthly',promoCode:'KHEDMA30'});
      await service.markPaid(admin,promoOrder.order.id,review(promoOrder.order,'receipt-test-3'));
    }
    const freshUser=paid===other.order.id?users[0]:users[1];
    await assert.rejects(service.quote(freshUser,{planCode:'starter_monthly',promoCode:'KHEDMA30'}),/redemption limit/);
    const rollback=await readFile(resolve(__dirname,'../../../../backend/migrations/versions/033_billing_admin_role_rollback.sql'),'utf8');
    const client=await pool.connect();
    try{
      await assert.rejects(client.query(rollback),(error:unknown)=>typeof error==='object'&&error!==null&&'code' in error&&(error as {code?:string}).code==='55000'&&'message' in error&&String((error as {message?:string}).message).includes('MIGRATION_033_ROLLBACK_BLOCKED'));
      await client.query('ROLLBACK');
      await client.query("DELETE FROM admin_roles WHERE role='billing_admin'");
      await client.query(rollback);
      const definition=(await client.query("SELECT pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='public.admin_roles'::regclass AND conname='admin_roles_role_check'")).rows[0].definition;
      assert.doesNotMatch(definition,/billing_admin/);
      await assert.rejects(client.query('INSERT INTO admin_roles(id,user_id,role) VALUES($1,$2,$3)',[randomUUID(),admin,'billing_admin']),(error:unknown)=>typeof error==='object'&&error!==null&&'code' in error&&(error as {code?:string}).code==='23514');
    }finally{client.release();}
  }finally{await pool.end();}
});
