import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('eligible Professional Detail exposes the one shared inquiry journey', async () => {
  const [professional, business, shared] = await Promise.all([
    read('../app/professional-profiles/[id]/page.tsx'),
    read('../app/business-profiles/[id]/page.tsx'),
    read('../components/contact-inquiry-form.tsx')
  ]);
  assert.match(professional, /profile\.contactEligibility\?\.eligible/);
  assert.match(professional, /target=\{\{ type: 'professional', id: profile\.id \}\}/);
  assert.match(business, /target=\{\{ type: 'business', id: business\.id \}\}/);
  assert.match(professional, /components\/contact-inquiry-form/);
  assert.match(business, /components\/contact-inquiry-form/);
  assert.match(shared, /اطلب الخدمة/);
  const componentFiles = (await readdir(new URL('../components/', import.meta.url))).filter((name) => /contact-inquiry-form\.tsx$/.test(name));
  assert.deepEqual(componentFiles, ['contact-inquiry-form.tsx']);
});

test('shared REF-011 and REF-012 preserve minimal validated Contact data', async () => {
  const shared = await read('../components/contact-inquiry-form.tsx');
  assert.match(shared, /REF-011 · تفاصيل الطلب/);
  assert.match(shared, /minLength=\{10\}/);
  assert.match(shared, /maxLength=\{2000\}/);
  assert.match(shared, /REF-012 · بيانات التواصل/);
  for (const field of ['name', 'contactEmail', 'message']) assert.match(shared, new RegExp(`\\b${field}\\b`));
  assert.doesNotMatch(shared, /phone|address|coordinates|sms|appointment|calendar|checkout|payment/i);
});

test('Professional submits its exact target through shared idempotency and receipt', async () => {
  const [shared, client] = await Promise.all([read('../components/contact-inquiry-form.tsx'), read('../lib/api-client.ts')]);
  assert.match(shared, /new InquirySubmissionGuard/);
  assert.match(shared, /api\.contact\.submitInquiry\(target/);
  assert.match(client, /target\.type === 'business' \? 'businesses' : 'professionals'/);
  assert.match(client, /targetType: 'business' \| 'professional'/);
  assert.match(shared, /REF-013/);
  assert.match(shared, /receipt\.trackingStatus/);
  assert.match(shared, /returnHref/);
  assert.doesNotMatch(shared, /window\.location|https?:\/\/|\\\\/);
});

test('shared journey retains accessibility and retry contracts', async () => {
  const shared = await read('../components/contact-inquiry-form.tsx');
  for (const contract of [/role="alert"/, /role="status"/, /aria-invalid/, /aria-busy/, /event\.key === 'Escape'/, /\.focus\(\)/, /requestAnimationFrame/]) assert.match(shared, contract);
});
