import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('contact backend exposes only approved inquiry and contact click endpoints', async () => {
  const controller = await read('apps/backend/src/contact/contact.controller.ts');

  assert.match(controller, /@Controller\('businesses\/:businessProfileId'\)/);
  assert.match(controller, /@Post\('inquiries'\)/);
  assert.match(controller, /@Post\('contact-click'\)/);
  assert.doesNotMatch(controller, /message|chat|conversation|marketplace|payment|advertising|ranking|recommendation|community/i);
});

test('contact service enforces approval, validation, audit, abuse, rate limit, and privacy boundaries', async () => {
  const service = await read('apps/backend/src/contact/contact.service.ts');
  const validation = await read('apps/backend/src/contact/contact.validation.ts');
  const rateLimit = await read('apps/backend/src/contact/contact-rate-limit.service.ts');
  const abuse = await read('apps/backend/src/contact/contact-abuse.service.ts');

  assert.match(service, /requirePublicApprovedBusiness/);
  assert.match(service, /visibility !== 'public'/);
  assert.match(service, /trustStatus !== 'approved'/);
  assert.match(service, /contact\.inquiry\.submitted/);
  assert.match(service, /toPublicInquiryReceipt/);
  assert.match(validation, /EMAIL_PATTERN/);
  assert.match(rateLimit, /RateLimitDecision/);
  assert.match(abuse, /shouldBlockInquiry/);
  assert.doesNotMatch(service, /passwordHash|plainPassword|secret|credential/i);
});

test('contact database SQL creates only contact_inquiries', async () => {
  const sql = await read('infra/database/003_contact_foundation.sql');
  const tables = [...sql.matchAll(/CREATE TABLE\s+([a-z_]+)/g)].map((match) => match[1]).sort();

  assert.deepEqual(tables, ['contact_inquiries']);
  assert.doesNotMatch(sql, /CREATE TABLE\s+(messaging|chat|conversations|marketplace|payments|advertising|ranking|recommendations|community|khedmah_connect|analytics_events)/i);
});
