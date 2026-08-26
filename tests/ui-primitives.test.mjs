import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

async function read(path) { return readFile(new URL(`../${path}`, import.meta.url), 'utf8'); }

test('Web primitives cover the seven template foundations', async () => {
  const [components, styles, layout] = await Promise.all([
    read('apps/frontend/app/components/ui-primitives.tsx'),
    read('apps/frontend/app/ui-primitives.css'),
    read('apps/frontend/app/layout.tsx')
  ]);
  for (const component of ['PageShell', 'PageHeader', 'Surface', 'ActionLink', 'ActionButton', 'StatusMessage', 'EmptyState', 'SkeletonGrid']) assert.match(components, new RegExp(`function ${component}`));
  assert.match(styles, /--k-color-surface/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(layout, /ui-primitives\.css/);
});

test('service catalog uses shared structure instead of the legacy phone shell', async () => {
  const catalog = await read('apps/frontend/app/components/category-directory.tsx');
  assert.match(catalog, /<PageShell/);
  assert.match(catalog, /<PageHeader/);
  assert.match(catalog, /<EmptyState/);
  assert.match(catalog, /<SkeletonGrid/);
  assert.doesNotMatch(catalog, /catalog-phone|catalog-header|catalog-skeleton/);
});

test('account page reads the real session and has no simulated save', async () => {
  const profile = await read('apps/frontend/app/users/me/page.tsx');
  assert.match(profile, /api\.auth\.session\(\)/);
  assert.match(profile, /user\.profile\.displayName/);
  assert.match(profile, /user\.email/);
  assert.doesNotMatch(profile, /setTimeout|تم تجهيز واجهة/);
});

test('Android screens consume shared state and result cards', async () => {
  const [components, activity] = await Promise.all([
    read('apps/android/app/src/main/java/com/khedmah/digital/KhedmahComponents.kt'),
    read('apps/android/app/src/main/java/com/khedmah/digital/MainActivity.kt')
  ]);
  assert.match(components, /fun KhedmahStateCard/);
  assert.match(components, /fun KhedmahResultCard/);
  assert.match(activity, /KhedmahStateCard/);
  assert.match(activity, /KhedmahResultCard/);
});
