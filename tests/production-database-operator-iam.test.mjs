import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const bootstrap = await readFile(new URL('../infra/iac/bootstrap/main.tf', import.meta.url), 'utf8');

function resourceBlock(type, name) {
  const marker = `resource "${type}" "${name}" {`;
  const start = bootstrap.indexOf(marker);
  assert.notEqual(start, -1, `missing Terraform resource ${type}.${name}`);

  const end = bootstrap.indexOf('\n}', start);
  assert.notEqual(end, -1, `unterminated Terraform resource ${type}.${name}`);
  return bootstrap.slice(start, end + 2);
}

test('Production database cutover adds the exact restart permission without broad Cloud SQL roles', () => {
  const role = resourceBlock('google_project_iam_custom_role', 'database_user_role_manager');
  const binding = resourceBlock('google_project_iam_member', 'deployer_database_user_role_manager');
  const permissions = [...role.matchAll(/"(cloudsql\.[^"]+)"/g)]
    .map((match) => match[1])
    .sort();

  assert.deepEqual(permissions, [
    'cloudsql.instances.get',
    'cloudsql.instances.list',
    'cloudsql.instances.restart',
    'cloudsql.users.get',
    'cloudsql.users.list',
    'cloudsql.users.update',
  ]);
  assert.match(role, /emergency cutover session eviction by instance restart/);
  assert.match(binding, /role\s+=\s+google_project_iam_custom_role\.database_user_role_manager\.name/);
  assert.match(binding, /member\s+=\s+"serviceAccount:\$\{google_service_account\.deployer\.email\}"/);
  assert.doesNotMatch(bootstrap, /roles\/cloudsql\.(?:admin|editor)/);
});

test('Production database alias commits use a two-permission role scoped only to the migration secret', () => {
  const role = resourceBlock('google_project_iam_custom_role', 'database_migration_alias_manager');
  const binding = resourceBlock(
    'google_secret_manager_secret_iam_member',
    'database_migration_deployer_alias_manager',
  );
  const permissions = [...role.matchAll(/"(secretmanager\.[^"]+)"/g)]
    .map((match) => match[1])
    .sort();

  assert.deepEqual(permissions, [
    'secretmanager.secrets.get',
    'secretmanager.secrets.update',
  ]);
  assert.match(binding, /secret_id\s+=\s+google_secret_manager_secret\.database_migration\.secret_id/);
  assert.match(binding, /role\s+=\s+google_project_iam_custom_role\.database_migration_alias_manager\.name/);
  assert.match(binding, /member\s+=\s+"serviceAccount:\$\{google_service_account\.deployer\.email\}"/);

  const projectBindings = bootstrap.match(
    /resource "google_project_iam_member" "[^"]+" \{[\s\S]*?\n\}/g,
  ) ?? [];
  assert.ok(projectBindings.every((block) => !block.includes('database_migration_alias_manager')));
  assert.equal(
    (bootstrap.match(/google_project_iam_custom_role\.database_migration_alias_manager\.name/g) ?? []).length,
    1,
  );
});
