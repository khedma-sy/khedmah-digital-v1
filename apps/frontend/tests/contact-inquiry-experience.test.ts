import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('business profile offers the approved Arabic service request journey', async () => {
  const page = await read('../app/business-profiles/[id]/page.tsx');
  const form = await read('../app/business-profiles/[id]/contact-inquiry-form.tsx');

  assert.match(page, /business\.visibility === 'public'/);
  assert.match(page, /business\.trustStatus === 'approved'/);
  assert.match(form, /اطلب الخدمة/);
  assert.match(form, /api\.businesses\.submitInquiry/);
  assert.match(form, /aria-expanded=\{isOpen\}/);
  assert.match(form, /aria-busy=\{submissionState === 'submitting'\}/);
});

test('contact inquiry reports honest success without promising fulfillment', async () => {
  const form = await read('../app/business-profiles/[id]/contact-inquiry-form.tsx');

  assert.match(form, /تم إرسال طلبك بنجاح/);
  assert.match(form, /لا يُعد الإرسال تأكيداً للحجز أو موعداً لتقديم الخدمة/);
  assert.match(form, /لن تظهر علناً/);
  assert.match(form, /رقم المتابعة/);
  assert.match(form, /لم يتم تسجيل طلبك/);
});

test('frontend reuses the existing contact inquiry endpoint', async () => {
  const client = await read('../lib/api-client.ts');

  assert.match(client, /`\/businesses\/\$\{id\}\/inquiries`/);
  assert.doesNotMatch(client, /chat|message-index|mongodb/i);
});

test('contact inquiry UI is isolated in a co-located CSS module', async () => {
  const form = await read('../app/business-profiles/[id]/contact-inquiry-form.tsx');
  const styles = await read('../app/business-profiles/[id]/contact-inquiry-form.module.css');
  const globals = await read('../app/globals.css');

  assert.match(form, /contact-inquiry-form\.module\.css/);
  assert.match(styles, /\.panel/);
  assert.doesNotMatch(globals, /\.inquiry-panel|\.service-request-button/);
});
