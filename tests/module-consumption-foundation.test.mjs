import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

async function collectFiles(directory, extension) {
  const results = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) results.push(...await collectFiles(entryPath, extension));
    if (entry.isFile() && entry.name.endsWith(extension)) results.push(entryPath);
  }
  return results;
}

function relativeImports(content) {
  return [...content.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)]
    .map((match) => match[1])
    .filter((specifier) => specifier.startsWith('.'));
}

test('Mission 069G adapter and application port scaffolding exists without runtime wiring', async () => {
  for (const file of [
    'apps/backend/src/integration/canonical-module-adapter.ts',
    'apps/backend/src/integration/application-ports.ts',
    'apps/backend/src/integration/README.md',
    'docs/architecture/MODULE-CONSUMPTION-FOUNDATION.md',
  ]) assert.equal((await stat(path.join(root, file))).isFile(), true);

  const appModule = await read('apps/backend/src/app.module.ts');
  assert.doesNotMatch(appModule, /integration|CanonicalApplicationPort|ModuleAdapter/);
});

test('application port foundation defines identity profile and organization boundaries only', async () => {
  const ports = await read('apps/backend/src/integration/application-ports.ts');
  for (const name of ['IdentityApplicationPort', 'ProfileApplicationPort', 'OrganizationApplicationPort']) assert.match(ports, new RegExp(`interface ${name}`));
  assert.doesNotMatch(ports, /@Injectable|@Module|@Controller|CREATE TABLE|SELECT\s|INSERT\s|password|sessionToken|employee|payment/i);
});

test('canonical backend modules remain framework neutral', async () => {
  const moduleFiles = await collectFiles(path.join(root, 'backend/modules'), '.mjs');
  const content = (await Promise.all(moduleFiles.map((file) => readFile(file, 'utf8')))).join('\n');
  assert.doesNotMatch(content, /from ['"]@nestjs\/|from ['"]express|@Controller\b|@Injectable\b|@Module\b|import\s+(?:type\s+)?\{[^}]*\b(?:Request|Response)\b/);
  assert.doesNotMatch(content, /apps\/backend|\.\.\/\.\.\/\.\.\/apps/);
});

test('runtime controllers do not directly access database migration or repository layers', async () => {
  const controllerFiles = await collectFiles(path.join(root, 'apps/backend/src'), '.controller.ts');
  controllerFiles.push(path.join(root, 'apps/backend/src/health.controller.ts'));
  const content = (await Promise.all([...new Set(controllerFiles)].map((file) => readFile(file, 'utf8')))).join('\n');
  assert.doesNotMatch(content, /backend\/database|backend\/migrations|infra\/database|databaseClient|Repository['"]/);
});

test('canonical module relative import graph is acyclic and all targets exist', async () => {
  const files = await collectFiles(path.join(root, 'backend/modules'), '.mjs');
  const known = new Set(files.map((file) => path.resolve(file)));
  const edges = new Map(files.map((file) => [path.resolve(file), []]));
  for (const file of files) {
    for (const specifier of relativeImports(await readFile(file, 'utf8'))) {
      const unresolved = path.resolve(path.dirname(file), specifier);
      const target = path.extname(unresolved) ? unresolved : `${unresolved}.mjs`;
      assert.equal(known.has(target) || !target.includes(`${path.sep}backend${path.sep}modules${path.sep}`), true, `missing canonical module import: ${file} -> ${specifier}`);
      if (known.has(target)) edges.get(path.resolve(file)).push(target);
    }
  }

  const visiting = new Set();
  const visited = new Set();
  function visit(file) {
    assert.equal(visiting.has(file), false, `circular canonical dependency at ${file}`);
    if (visited.has(file)) return;
    visiting.add(file);
    for (const dependency of edges.get(file) || []) visit(dependency);
    visiting.delete(file);
    visited.add(file);
  }
  for (const file of edges.keys()) visit(file);
});

test('adapter boundary forbids duplicate domain rules security changes and KILL CRITICAL scope', async () => {
  const adapter = await read('apps/backend/src/integration/canonical-module-adapter.ts');
  const ports = await read('apps/backend/src/integration/application-ports.ts');
  const documentation = `${await read('apps/backend/src/integration/README.md')}\n${await read('docs/architecture/MODULE-CONSUMPTION-FOUNDATION.md')}`;
  assert.doesNotMatch(`${adapter}\n${ports}`, /Lifecycle(Status|State)|OwnershipRule|Visibility(Class|Rule)|validate[A-Z]|AUTHENTICATION|AUTHORIZATION/);
  assert.match(documentation, /does not change authentication, authorization/);
  assert.match(documentation, /must not define lifecycle constants, allowed-value lists, validation rules, ownership or permission decisions, visibility rules, privacy classifications/);
  assert.doesNotMatch(`${adapter}\n${ports}`, /marketplace|payment|order|commission|advertising|ranking|social|recommendation|tracking/i);
});
