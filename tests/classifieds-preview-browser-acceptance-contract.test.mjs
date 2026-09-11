import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const acceptance = read('scripts/check-classifieds-preview-acceptance.mjs');
const workflow = read('.github/workflows/preview-deployment.yml');
const page = read('apps/frontend/app/classifieds/page.tsx');
const client = read('apps/frontend/lib/classifieds-client.ts');
const nextConfig = read('apps/frontend/next.config.ts');

test('Classifieds Preview acceptance is anonymous and read-only', () => {
  assert.match(acceptance, /scope: 'Read-only anonymous acceptance/);
  assert.match(acceptance, /fetch\(new URL\('\/api\/v1\/classifieds', backendOrigin\)/);
  assert.match(acceptance, /response\.request\(\)\.method\(\) === 'GET'/);
  assert.doesNotMatch(acceptance, /method:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/);
  assert.doesNotMatch(acceptance, /page\.click|\.click\(\)/);
});

test('browser acceptance proves the feature is enabled and the Classifieds surface is present', () => {
  assert.match(acceptance, /إعلانات خدمة غير متاحة مؤقتًا في هذه البيئة\./);
  assert.match(acceptance, /CLASSIFIEDS_FRONTEND_STILL_DISABLED/);
  assert.match(acceptance, /البحث في إعلانات خدمة/);
  assert.match(acceptance, /أضف إعلانًا/);
  assert.match(acceptance, /إعلاناتي/);
  assert.match(page, /if \(!CLASSIFIEDS_ENABLED\) return <DisabledClassifieds\/>/);
});

test('browser acceptance observes the same-origin Ads API path and validates its envelope', () => {
  assert.match(acceptance, /url\.origin === frontendOrigin && url\.pathname === '\/api\/v1\/classifieds'/);
  assert.match(acceptance, /CLASSIFIEDS_PROXY_API_NOT_200/);
  assert.match(acceptance, /isAdsEnvelope\(envelope\)/);
  assert.match(client, /return request<\{ ads: PublicAdListing\[\] \}>\(`\/classifieds/);
  assert.match(client, /fetch\(`\$\{API_BASE\}\/api\/v1\$\{path\}`/);
});

test('Next.js same-origin API route is pinned to the build-time backend origin', () => {
  assert.match(nextConfig, /const backendOrigin = process\.env\.NEXT_PUBLIC_API_URL/);
  assert.match(nextConfig, /source: '\/api\/v1\/:path\*'/);
  assert.match(nextConfig, /destination: `\$\{backendOrigin\}\/api\/v1\/:path\*`/);
});

test('Preview review-evidence runs Classifieds acceptance despite a missing visual baseline', () => {
  assert.match(workflow, /name: Verify Classifieds Preview acceptance/);
  assert.match(workflow, /id: classifieds-acceptance/);
  assert.match(workflow, /if: always\(\) && !cancelled\(\) && steps\.browser-tools\.outcome == 'success'/);
  assert.match(workflow, /AFTER_URL: \$\{\{ needs\.deploy-preview\.outputs\.frontend_url \}\}/);
  assert.match(workflow, /BACKEND_URL: \$\{\{ needs\.deploy-preview\.outputs\.backend_url \}\}/);
  assert.match(workflow, /run: node scripts\/check-classifieds-preview-acceptance\.mjs/);
});
