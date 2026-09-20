import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(new URL('../.github/workflows/production-bootstrap-admin.yml', import.meta.url), 'utf8');

test('production bootstrap admin requires the bootstrap email to be an operations director', () => {
  assert.match(workflow, /PRODUCTION_BOOTSTRAP_ADMIN_EMAIL/);
  assert.match(workflow, /OPERATIONS_PRODUCT_ROLE_BINDINGS:\s*\$\{\{ secrets\.OPERATIONS_PRODUCT_ROLE_BINDINGS \}\}/);
  assert.match(workflow, /normalized_admin_email/);
  assert.match(workflow, /tr '\[:upper:\]' '\[:lower:\]'/);
  assert.match(workflow, /index\("operations_product_director"\)/);
  assert.match(workflow, /Bootstrap admin email is not bound to operations_product_director/);
});

test('bootstrap role-binding validation does not print secret payloads', () => {
  assert.match(workflow, /set \+x/);
  assert.doesNotMatch(workflow, /echo\s+"?\$OPERATIONS_PRODUCT_ROLE_BINDINGS/);
  assert.doesNotMatch(workflow, /printf\s+['"]%s['"]\s+"?\$OPERATIONS_PRODUCT_ROLE_BINDINGS/);
});

test('bootstrap remains email-verification gated after role validation', () => {
  assert.match(workflow, /Create the first pending administrator and request verification/);
  assert.match(workflow, /created pending email verification/);
  assert.match(workflow, /created_email_failed/);
});

test('owner role composition covers the platform admin surfaces intentionally linked from the admin shell', async () => {
  const [roles, categories, pricing, billing, orders] = await Promise.all([
    readFile(new URL('../apps/backend/src/operations-product/operations-product.types.ts', import.meta.url), 'utf8'),
    readFile(new URL('../apps/backend/src/categories/category-admin.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../apps/backend/src/taxi/taxi-pricing.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../apps/backend/src/billing/billing.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../apps/backend/src/orders/order.service.ts', import.meta.url), 'utf8')
  ]);
  assert.match(roles, /operations_product_director:[^\n]*'operations\.read'[^\n]*'security\.manage'/);
  assert.match(categories, /role==='bootstrap_admin'\|\|role==='category_admin'/);
  assert.match(pricing, /role === 'bootstrap_admin' \|\| role === 'taxi_pricing_admin'/);
  assert.match(billing, /r==='bootstrap_admin'\|\|r==='billing_admin'/);
  assert.match(orders, /b\.ownerUserId !== actor\.id/);
});
