import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('billing v2 uses new Syrian pound minor units, one-time welcome grants and append-only ledgers',async()=>{
  const migration=await read('backend/migrations/versions/030_billing_credits_subscriptions.sql');
  assert.match(migration,/currency_era[^\n]*SYP_NEW_2026/);
  assert.match(migration,/welcome_points[^\n]*100/);
  assert.match(migration,/UNIQUE\s*\(user_id,idempotency_key\)/);
  assert.match(migration,/grant_key TEXT NOT NULL UNIQUE/);
  assert.match(migration,/billing_credit_ledger_no_rewrite/);
  assert.match(migration,/billing_welcome_after_session/);
  assert.match(migration,/ON CONFLICT\(grant_key\) DO NOTHING/);
  assert.match(migration,/KHEDMA30/);
  assert.match(migration,/30,'عرض الانطلاق/);
});

test('billing service never exposes a user-controlled mark-paid or point-consume endpoint',async()=>{
  const controller=await read('apps/backend/src/billing/billing.controller.ts');
  const service=await read('apps/backend/src/billing/billing.service.ts');
  assert.match(controller,/Controller\('billing'\)/);
  assert.match(controller,/Controller\('admin\/billing'\)/);
  assert.match(controller,/mark-paid/);
  assert.doesNotMatch(controller,/consume/);
  assert.match(service,/billing_admin/);
  assert.match(service,/pg_advisory_xact_lock/);
  assert.match(service,/Insufficient points balance/);
  assert.match(service,/billing_usage_receipts/);
  assert.match(service,/promo code/i);
});

test('launch catalog contains monthly and annual packages priced only in new SYP',async()=>{
  const migration=await read('backend/migrations/versions/030_billing_credits_subscriptions.sql');
  for(const code of ['starter_monthly','starter_annual','growth_monthly','growth_annual','business_monthly','business_annual']) assert.match(migration,new RegExp(code));
  assert.match(migration,/billing_cycle IN \('monthly','annual'\)/);
  assert.doesNotMatch(migration,/currency[^\n]*(USD|EUR)/);
});
