import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('organization entry points are deprecated without stranding existing data', async () => {
  const [navigation, login, register, profile, client] = await Promise.all([
    read('app/auth-navigation.tsx'),
    read('app/auth/login/page.tsx'),
    read('app/auth/register/page.tsx'),
    read('app/users/me/page.tsx'),
    read('lib/api-client.ts')
  ]);

  await Promise.all([
    access(new URL('../app/organizations/page.tsx', import.meta.url)),
    access(new URL('../app/organizations/new/page.tsx', import.meta.url)),
    access(new URL('../app/organizations/[id]/page.tsx', import.meta.url))
  ]);

  assert.doesNotMatch(`${navigation}\n${profile}`, /منظماتي|مؤسساتي|href="\/organizations"/);
  assert.match(client, /organizations:[\s\S]*listMine\(\)[\s\S]*listMembers\(id: string\)/);
  assert.match(client, /PublicOrganization/);
  assert.match(login, /useState\('\/users\/me'\)/);
  assert.match(register, /router\.push\('\/users\/me'\)/);
});
