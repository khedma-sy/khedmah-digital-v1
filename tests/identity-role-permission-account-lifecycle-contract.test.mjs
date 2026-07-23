import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('identity role permission account lifecycle contract exists and records repository identity', async () => {
  const doc = await read('docs/contracts/IDENTITY-ROLE-PERMISSION-ACCOUNT-LIFECYCLE-CONTRACT.md');

  assert.match(doc, /# Identity, Role, Permission & Account Lifecycle Contract/);
  assert.match(doc, /\/workspace\/khedmah-digital-v1/);
  assert.match(doc, /correct `khedmah-digital-v1` repository/);
});

test('identity contract defines identity model and account types', async () => {
  const doc = await read('docs/contracts/IDENTITY-ROLE-PERMISSION-ACCOUNT-LIFECYCLE-CONTRACT.md');

  assert.match(doc, /User Account\n↓\nProfile\n↓\nRoles\n↓\nPermissions\n↓\nOwned Resources\n↓\nOrganization Relationships/);
  assert.match(doc, /User identity/);
  assert.match(doc, /Professional identity/);
  assert.match(doc, /Business identity/);
  assert.match(doc, /Organization identity/);
  assert.match(doc, /Partner identity/);
  assert.match(doc, /Representative identity/);
  assert.match(doc, /Individual User/);
  assert.match(doc, /Professional Account/);
  assert.match(doc, /Business Account/);
  assert.match(doc, /Organization Account/);
  assert.match(doc, /Partner Account/);
});

test('identity contract defines roles, permissions, ownership, and organization membership', async () => {
  const doc = await read('docs/contracts/IDENTITY-ROLE-PERMISSION-ACCOUNT-LIFECYCLE-CONTRACT.md');

  assert.match(doc, /Owner/);
  assert.match(doc, /Admin/);
  assert.match(doc, /Manager/);
  assert.match(doc, /Representative/);
  assert.match(doc, /Member/);
  assert.match(doc, /Worker/);
  assert.match(doc, /Who can own resources/);
  assert.match(doc, /Who can manage resources/);
  assert.match(doc, /Who can represent resources/);
  assert.match(doc, /Who can execute tasks/);
  assert.match(doc, /Role\n↓\nPermission\n↓\nAction/);
  assert.match(doc, /Prevent duplicate ownership/);
  assert.match(doc, /Organization\n↓\nMembers\n↓\nRoles\n↓\nPermissions/);
  assert.match(doc, /An organization member is not automatically/);
});

test('identity contract defines lifecycle states, trust compatibility, and V1 boundaries', async () => {
  const doc = await read('docs/contracts/IDENTITY-ROLE-PERMISSION-ACCOUNT-LIFECYCLE-CONTRACT.md');

  assert.match(doc, /Created\n↓\nPending\n↓\nActive\n↓\nSuspended\n↓\nArchived/);
  assert.match(doc, /profile lifecycle/i);
  assert.match(doc, /business lifecycle/i);
  assert.match(doc, /organization lifecycle/i);
  assert.match(doc, /Identity\n↓\nVerification\n↓\nTrust Level/);
  assert.match(doc, /Trust Foundation/);
  assert.match(doc, /Business Profiles/);
  assert.match(doc, /Professional Profiles/);
  assert.match(doc, /Partners/);
  assert.match(doc, /Representatives/);
  assert.match(doc, /This mission does not implement/);
  assert.match(doc, /Authentication system/);
  assert.match(doc, /Authorization system/);
  assert.match(doc, /Admin dashboard/);
  assert.match(doc, /Payments/);
  assert.match(doc, /Subscriptions/);
  assert.match(doc, /Marketplace/);
  assert.match(doc, /Commissions/);
  assert.match(doc, /Messaging/);
  assert.match(doc, /AI/);
  assert.match(doc, /Automation/);
});

test('RTL Arabic direction remains preserved for identity contract readiness', async () => {
  const layout = await read('apps/frontend/app/layout.tsx');
  const styles = await read('apps/frontend/app/globals.css');

  assert.match(layout, /lang="ar"/);
  assert.match(layout, /dir="rtl"/);
  assert.match(styles, /direction:\s*rtl/);
});
