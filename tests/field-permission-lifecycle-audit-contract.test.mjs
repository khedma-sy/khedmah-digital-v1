import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('field permission lifecycle audit contract exists and records repository identity', async () => {
  const doc = await read('docs/contracts/FIELD-PERMISSION-LIFECYCLE-AUDIT-CONTRACT.md');

  assert.match(doc, /# Field-Level Permission Matrix, Lifecycle State Transitions & Audit Contract/);
  assert.match(doc, /\/workspace\/khedmah-digital-v1/);
  assert.match(doc, /correct `khedmah-digital-v1` repository/);
});

test('field permission contract defines permission model and profile matrices', async () => {
  const doc = await read('docs/contracts/FIELD-PERMISSION-LIFECYCLE-AUDIT-CONTRACT.md');

  assert.match(doc, /Role\n↓\nPermission\n↓\nAction\n↓\nField Access/);
  assert.match(doc, /Resource permission/);
  assert.match(doc, /Field permission/);
  assert.match(doc, /Action permission/);
  assert.match(doc, /Business Profile Field Matrix/);
  assert.match(doc, /Name/);
  assert.match(doc, /Description/);
  assert.match(doc, /Verification information/);
  assert.match(doc, /Prevent unauthorized ownership changes/);
  assert.match(doc, /Professional Profile Matrix/);
  assert.match(doc, /Doctor/);
  assert.match(doc, /Engineer/);
  assert.match(doc, /Lawyer/);
  assert.match(doc, /Freelancer/);
});

test('field permission contract defines organization partner representative boundaries', async () => {
  const doc = await read('docs/contracts/FIELD-PERMISSION-LIFECYCLE-AUDIT-CONTRACT.md');

  assert.match(doc, /Organization\n↓\nMembers\n↓\nRoles\n↓\nPermissions/);
  assert.match(doc, /Add members/);
  assert.match(doc, /Remove members/);
  assert.match(doc, /Assign roles/);
  assert.match(doc, /Edit organization information/);
  assert.match(doc, /Partner Profile Permissions/);
  assert.match(doc, /Representative Relationship Permissions/);
  assert.match(doc, /Act on assigned scope/);
  assert.match(doc, /Become owner/);
  assert.match(doc, /Change ownership/);
  assert.match(doc, /Modify trust status/);
  assert.match(doc, /Modify verification evidence/);
});

test('field permission contract defines lifecycle, audit, trust compatibility, and V1 boundaries', async () => {
  const doc = await read('docs/contracts/FIELD-PERMISSION-LIFECYCLE-AUDIT-CONTRACT.md');

  assert.match(doc, /Created\n↓\nPending\n↓\nActive\n↓\nSuspended\n↓\nArchived/);
  assert.match(doc, /who can trigger/i);
  assert.match(doc, /Required reason/);
  assert.match(doc, /Audit requirement/);
  assert.match(doc, /Every sensitive action should record/);
  assert.match(doc, /Actor/);
  assert.match(doc, /Previous state/);
  assert.match(doc, /New state/);
  assert.match(doc, /Permissions\n↓\nVerification\n↓\nTrust Level/);
  assert.match(doc, /Users cannot modify their own trust directly/);
  assert.match(doc, /Representatives cannot change trust status/);
  assert.match(doc, /This mission does not implement/);
  assert.match(doc, /Permission engine/);
  assert.match(doc, /Audit database/);
  assert.match(doc, /Admin system/);
  assert.match(doc, /Approval workflows/);
  assert.match(doc, /Authentication/);
  assert.match(doc, /Authorization middleware/);
  assert.match(doc, /Marketplace/);
  assert.match(doc, /Payments/);
  assert.match(doc, /AI/);
  assert.match(doc, /Advertising/);
});

test('RTL Arabic direction remains preserved for permission contract readiness', async () => {
  const layout = await read('apps/frontend/app/layout.tsx');
  const styles = await read('apps/frontend/app/globals.css');

  assert.match(layout, /lang="ar"/);
  assert.match(layout, /dir="rtl"/);
  assert.match(styles, /direction:\s*rtl/);
});
