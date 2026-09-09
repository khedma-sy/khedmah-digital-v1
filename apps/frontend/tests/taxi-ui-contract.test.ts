import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('خدمة ديجتل is the visible brand while the umbrella identity stays unchanged', async () => {
  const layout = await read('app/layout.tsx');
  const mark = await read('app/components/brand-mark.tsx');
  assert.match(layout, /const SITE_NAME = 'خدمة ديجتل'/);
  assert.match(layout, /aria-label="خدمة ديجتل - الرئيسية"/);
  assert.match(mark, /<b>خدمة ديجتل<\/b>/);
  for (const color of ['#07427c', '#81be49', '#fd9603']) assert.match(mark, new RegExp(color));
  assert.match(mark, /تحت مظلة واحدة/);
});

test('taxi browser client does not mint trusted arrival or meter evidence', async () => {
  const client = await read('lib/taxi-client.ts');
  assert.match(client, /\/taxi\/rider\/quotes/);
  assert.match(client, /\/taxi\/driver\/offers/);
  assert.doesNotMatch(client, /arrive_pickup|finish_ride/);
  assert.doesNotMatch(client, /tripMeters|waitSeconds|meterVerified|arrivalVerified/);
});

test('driver offer contract stays redacted until assignment', async () => {
  const client = await read('lib/taxi-client.ts');
  const page = await read('app/taxi/page.tsx');
  assert.match(client, /type TaxiOffer = \{ id: string; kind: 'taxi'; pickupArea: string; dropoffArea\?: string; version: number \}/);
  assert.match(page, /offer\.pickupArea/);
  assert.match(page, /offer\.dropoffArea/);
  assert.doesNotMatch(page, /offer\.quote|offer\.customerId|offer\.cash/);
  assert.match(page, /التفاصيل الدقيقة لا تظهر قبل قبول الرحلة/);
});

test('rider consent sends only the backend-owned expected version contract', async () => {
  const client = await read('lib/taxi-client.ts');
  assert.match(client, /\/consent`, body\(\{ expectedVersion \}\)/);
  assert.doesNotMatch(client, /\/consent`, body\(\{ expectedVersion, requestId/);
});

test('taxi page keeps uncertain placement replayable and URL mode behind Suspense', async () => {
  const page = await read('app/taxi/page.tsx');
  assert.match(page, /sessionStorage\.setItem\(PLACE_KEY/);
  assert.match(page, /taxiApi\.rider\.place\(attempt\.quoteId, attempt\.requestId\)/);
  assert.match(page, /setHasPendingPlace\(!!sessionStorage\.getItem\(PLACE_KEY\)\)/);
  assert.match(page, /<Suspense[\s\S]*<TaxiContent\/>/);
  assert.match(page, /لا توجد أزرار لتزوير هذه البيانات من المتصفح/);
});

test('rider and driver can recover the active trip from their authenticated account', async () => {
  const client = await read('lib/taxi-client.ts');
  const page = await read('app/taxi/page.tsx');
  assert.match(client, /rider:\s*\{[\s\S]*active: \(\) => request<\{ tripId: string \| null \}>\('\/taxi\/rider\/trips\/active'\)/);
  assert.match(client, /driver:\s*\{[\s\S]*active: \(\) => request<\{ tripId: string \| null \}>\('\/taxi\/driver\/trips\/active'\)/);
  assert.match(page, /taxiApi\.rider\.active\(\)/);
  assert.match(page, /taxiApi\.driver\.active\(\)/);
});
