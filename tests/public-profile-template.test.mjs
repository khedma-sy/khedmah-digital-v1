import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const page = await readFile('apps/frontend/app/business-profiles/[id]/page.tsx', 'utf8');
const styles = await readFile('apps/frontend/app/business-profiles/[id]/public-profile.module.css', 'utf8');

test('public activity profile uses shared primitives and isolated visual system', () => {
  for (const primitive of ['PageShell', 'Surface', 'ActionButton', 'ActionLink', 'EmptyState', 'SkeletonGrid', 'StatusMessage']) {
    assert.match(page, new RegExp(`\\b${primitive}\\b`));
  }
  assert.match(page, /public-profile\.module\.css/);
  assert.doesNotMatch(page, /style=\{\{/);
  assert.doesNotMatch(page, /📘|📸|🐦|💬|✈️|💼|▶️|🎵|⭐|🗺️|📍|📞|✉|🌐|🔗/);
});

test('profile renders only real API-backed activity data', () => {
  for (const request of ['getPublic', 'listForOwner', 'getMedia', 'getOpeningHours', 'getBranches', 'getSocialLinks', 'getVerificationStatus']) {
    assert.match(page, new RegExp(`api\\.businesses\\.${request}|api\\.services\\.${request}`));
  }
  assert.match(page, /useCategories/);
  assert.doesNotMatch(page, /CATEGORY_LABELS|const SOCIAL_ICONS/);
});

test('profile preserves discovery, contact, trust and structured-data journeys', () => {
  assert.match(page, /ContactInquiryForm/);
  assert.match(page, /business\.visibility === 'public'/);
  assert.match(page, /business\.trustStatus === 'approved'/);
  assert.match(page, /LocalBusiness/);
  assert.match(page, /ProviderQrAction/);
  assert.match(page, /navigator\.share/);
  assert.match(page, /عرض الموقع على خرائط جوجل/);
});

test('profile layout supports theme tokens, desktop and mobile', () => {
  for (const token of ['--k-color-canvas', '--k-color-surface', '--k-color-text', '--k-color-primary', '--k-color-border']) {
    assert.match(styles, new RegExp(token));
  }
  assert.match(styles, /grid-template-columns:minmax\(0,1\.6fr\)/);
  assert.match(styles, /@media\(max-width:38rem\)/);
  assert.doesNotMatch(styles, /#06121a|#83ca3e|#0a202c/);
});
