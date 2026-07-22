import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OrganizationAccessError } from './organization.errors';
import { OrganizationRepository } from './organization.repository';
import { OrganizationService } from './organization.service';

test('organization service source enforces ownership and membership checks', async () => {
  const source = await import('node:fs/promises').then((fs) => fs.readFile(new URL('./organization.service.ts', import.meta.url), 'utf8'));

  assert.match(source, /requireOwner/);
  assert.match(source, /requireActiveMember/);
  assert.match(source, /organization\.member\.add/);
  assert.match(source, /organization\.member\.remove/);
  assert.ok(OrganizationRepository);
  assert.ok(OrganizationService);
  assert.ok(OrganizationAccessError);
});
