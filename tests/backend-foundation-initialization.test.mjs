import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const exists = (path) => existsSync(new URL(`../${path}`, import.meta.url));

const approvedModules = [
  'identity',
  'users',
  'profiles',
  'organizations',
  'business_profiles',
  'professional_profiles',
  'service_catalog',
  'locations',
  'trust_verification',
  'relationships',
  'audit',
  'analytics',
];

test('backend foundation structure and README exist', async () => {
  assert.equal(exists('backend/README.md'), true);
  for (const folder of ['modules', 'core', 'config', 'database', 'shared', 'tests', 'migrations']) {
    assert.equal(exists(`backend/${folder}/README.md`), true, `${folder} README should exist`);
  }

  const readme = await read('backend/README.md');
  assert.match(readme, /Khedmah Digital V1 Backend Foundation/);
  assert.match(readme, /Mission 049 Backend Foundation Architecture Contract/);
  assert.match(readme, /Mission 050 Backend Module Skeleton Governance Contract/);
  assert.match(readme, /API\n↓\nApplication\n↓\nDomain\n↓\nRepository\n↓\nDatabase/);
  assert.match(readme, /No-Feature Boundary/);
});

test('core foundation areas preserve approved boundaries', async () => {
  const core = await read('backend/core/README.md');
  assert.match(core, /Backend Core Foundation/);
  assert.match(core, /errors\//);
  assert.match(core, /logging\//);
  assert.match(core, /security\//);
  assert.match(core, /validation\//);

  const errors = await read('backend/core/errors/README.md');
  assert.match(errors, /base error foundation/);
  assert.match(errors, /does not implement API responses/);

  const logging = await read('backend/core/logging/README.md');
  assert.match(logging, /structured logging foundation/);
  assert.match(logging, /does not implement production log transport/);

  const security = await read('backend/core/security/README.md');
  assert.match(security, /documentation-only placeholder/);
  assert.match(security, /does not implement code/);

  const validation = await read('backend/core/validation/README.md');
  assert.match(validation, /reusable validation foundation/);
  assert.match(validation, /does not implement business validation rules/);
});

test('configuration, database, migrations, shared, and test foundations preserve boundaries', async () => {
  const config = await read('backend/config/README.md');
  assert.match(config, /configuration naming examples/);
  assert.match(config, /environment variable names/);
  assert.match(config, /real secrets/);
  assert.match(config, /credentials/);
  assert.match(config, /tokens/);
  assert.match(config, /production values/);

  const database = await read('backend/database/README.md');
  assert.match(database, /database architecture notes/);
  assert.match(database, /Forbidden in Mission 051/);
  assert.match(database, /database connections/);
  assert.match(database, /ORM models/);
  assert.match(database, /migrations/);

  const migrations = await read('backend/migrations/README.md');
  assert.match(migrations, /Migrations will be introduced later/);
  assert.match(migrations, /Mission 048/);
  assert.match(migrations, /No database tables/);

  const shared = await read('backend/shared/README.md');
  assert.match(shared, /technical and domain-neutral/);
  assert.match(shared, /Business logic/);

  const tests = await read('backend/tests/README.md');
  assert.match(tests, /unit tests/);
  assert.match(tests, /integration tests/);
  assert.match(tests, /security tests/);
  assert.match(tests, /regression tests/);
  assert.match(tests, /does not create feature tests/);
});

test('approved module directories contain README placeholders only', async () => {
  const moduleEntries = await readdir(new URL('../backend/modules', import.meta.url), { withFileTypes: true });
  const modules = moduleEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  assert.deepEqual(modules.sort(), approvedModules.toSorted());

  for (const moduleName of approvedModules) {
    const entries = await readdir(new URL(`../backend/modules/${moduleName}`, import.meta.url));
    if (['identity', 'users'].includes(moduleName)) {
      assert.deepEqual(entries, ['README.md', 'api', 'application', 'domain', 'repositories', 'schemas', 'tests']);
    } else {
      assert.deepEqual(entries, ['README.md'], `${moduleName} should contain README.md only`);
    }
    const doc = await read(`backend/modules/${moduleName}/README.md`);
    assert.match(doc, /Mission 051 Boundary/);
    assert.match(doc, /Module Responsibility/);
    assert.match(doc, /Ownership Boundary/);
    assert.match(doc, /Allowed Dependencies/);
    assert.match(doc, /Forbidden Dependencies/);
    assert.match(doc, /does not implement APIs, services, repositories, schemas/);
  }
});

test('kill-critical backend structure excludes forbidden modules and runtime artifacts', async () => {
  const moduleEntries = await readdir(new URL('../backend/modules', import.meta.url), { withFileTypes: true });
  const modules = moduleEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  const forbiddenModules = modules.filter((entry) => /^(marketplace|payments?|commissions?|advertising|social|ai|ranking|tracking|orders?|checkout|wallets?|chat|messaging)$/i.test(entry));
  assert.deepEqual(forbiddenModules, []);

  const rootReadme = await read('backend/README.md');
  assert.match(rootReadme, /no business logic/i);
  assert.match(rootReadme, /no API routes/i);
  assert.match(rootReadme, /No database connection exists here/);
  assert.match(rootReadme, /No authentication implementation exists here/);
  assert.match(rootReadme, /No production configuration exists here/);
  assert.match(rootReadme, /No-Feature Boundary/);
});

test('RTL Arabic direction remains preserved for backend foundation initialization', async () => {
  const layout = await read('apps/frontend/app/layout.tsx');
  const styles = await read('apps/frontend/app/globals.css');

  assert.match(layout, /lang="ar"/);
  assert.match(layout, /dir="rtl"/);
  assert.match(styles, /direction:\s*rtl/);
});
