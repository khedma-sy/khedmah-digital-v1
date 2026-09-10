import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function read(relativePath) {
  return fs.readFile(path.join(root, relativePath), 'utf8');
}

test('backend foundation structure and README exist', async () => {
  const expectedPaths = [
    'backend/README.md',
    'backend/core/errors/README.md',
    'backend/core/logging/README.md',
    'backend/core/security/README.md',
    'backend/core/validation/README.md',
    'backend/config/README.md',
    'backend/database/README.md',
    'backend/migrations/README.md',
    'backend/shared/README.md',
    'backend/tests/README.md'
  ];

  for (const relativePath of expectedPaths) {
    const stat = await fs.stat(path.join(root, relativePath));
    assert.equal(stat.isFile(), true, `${relativePath} must be a file`);
  }
});

test('core foundation areas preserve approved boundaries', async () => {
  const errors = await read('backend/core/errors/README.md');
  assert.match(errors, /shared error model/);
  assert.match(errors, /does not define domain-specific error codes/);

  const logging = await read('backend/core/logging/README.md');
  assert.match(logging, /logging design principles/);
  assert.match(logging, /does not implement logging output/);

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
  assert.match(migrations, /001_core_identity_accounts\.sql/);
  assert.match(migrations, /Mission 048/);
  assert.match(migrations, /every version through `025`/);
  assert.match(migrations, /version `023` intentionally unused/);
  assert.match(migrations, /never executed by application startup/);

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

test('approved module directories preserve governed placeholder or foundation structures', async () => {
  const backend = await read('backend/README.md');
  assert.match(backend, /Identity/);
  assert.match(backend, /Users/);
  assert.match(backend, /Profiles/);
  assert.match(backend, /Business Profile/);
  assert.match(backend, /Professional Profile/);
  assert.match(backend, /Organizations/);
  assert.match(backend, /Service Catalog/);
  assert.match(backend, /Locations/);
  assert.match(backend, /Relationships/);
  assert.match(backend, /Trust/);
  assert.match(backend, /Audit/);
  assert.match(backend, /Job Work/);
  assert.match(backend, /Analytics/);
});

test('kill-critical backend structure excludes forbidden modules and runtime artifacts', async () => {
  const backend = await read('backend/README.md');
  assert.match(backend, /no payment/);
  assert.match(backend, /no marketplace/);
  assert.match(backend, /no messaging/);
  assert.match(backend, /no workflow engine/);
});

test('RTL Arabic direction remains preserved for backend foundation initialization', async () => {
  const backend = await read('backend/README.md');
  assert.match(backend, /RTL/);
  assert.match(backend, /Arabic/);
});
