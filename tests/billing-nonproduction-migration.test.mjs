import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [runner, ensure, deploy, dockerfile, cloudbuild, migration, billingAdminRoleMigration] = await Promise.all([
  read('scripts/deployment/run-billing-nonproduction-migration.sh'),
  read('scripts/deployment/ensure-billing-nonproduction-schema.sh'),
  read('scripts/deployment/deploy-cloud-run-environment.sh'),
  read('Dockerfile.billing-migration'),
  read('cloudbuild.billing-migration.yaml'),
  read('backend/migrations/versions/030_billing_credits_subscriptions.sql'),
  read('backend/migrations/versions/033_billing_admin_role.sql')
]);

test('Billing 030 and 033 are preview/staging only, identity-bound and fail closed on partial state', () => {
  for (const required of [
    '030_billing_credits_subscriptions',
    'd758036cbcf20fbcee176c9ea7ba097564142de839b609b22a5cb469d6335194',
    '88795ee75d9948e5ecf85d8c2d53f6b77397b52b',
    '033_billing_admin_role',
    'acc42c10459b0f90c276e843942bc712283616fc71ac854c177bb20defa34463',
    '7bbdd79c5c129f41134c10ba15eedc644e396888',
    'Refusing Billing migration 030 against the production project',
    'partial_or_unverified',
    'MIGRATION_033_PARTIAL_OR_UNVERIFIED_STATE',
    "pg_advisory_xact_lock(hashtextextended('khedmah-nonproduction-billing-030',0))",
    "pg_advisory_xact_lock(hashtextextended('khedmah-nonproduction-billing-033',0))",
    'pg_get_constraintdef(c.oid)',
    "d.definition LIKE '%billing_admin%'",
    'SYP_NEW_2026',
    'KHEDMA30'
  ]) assert.match(runner, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(runner, /DROP\s+TABLE|TRUNCATE|DELETE\s+FROM/i);
});

test('Billing 033 reviewed identity is computed from the current canonical migration', () => {
  const bytes = Buffer.from(billingAdminRoleMigration);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const gitBlob = createHash('sha1')
    .update(Buffer.from(`blob ${bytes.length}\0`))
    .update(bytes)
    .digest('hex');

  assert.equal(sha256, 'acc42c10459b0f90c276e843942bc712283616fc71ac854c177bb20defa34463');
  assert.equal(gitBlob, '7bbdd79c5c129f41134c10ba15eedc644e396888');
  assert.match(ensure, new RegExp(sha256));
  assert.match(ensure, new RegExp(gitBlob));
});

test('Billing 033 is checked only after 030 verification and uses a separate apply lock', () => {
  const execution = runner.slice(runner.indexOf('state="$(schema_state_030)"'));
  const alreadyVerified030 = execution.indexOf('MIGRATION_030_ALREADY_APPLIED_AND_VERIFIED');
  const verify033 = execution.indexOf('state_033="$(schema_state_033)"');
  const apply030 = execution.indexOf("pg_advisory_xact_lock(hashtextextended('khedmah-nonproduction-billing-030',0))");
  const apply033 = execution.indexOf("pg_advisory_xact_lock(hashtextextended('khedmah-nonproduction-billing-033',0))");

  assert.ok(alreadyVerified030 >= 0 && verify033 > alreadyVerified030);
  assert.ok(apply030 >= 0 && apply033 > apply030);
  const verified030Branch = execution.slice(
    execution.indexOf("if [ \"$state\" = 'verified' ]; then"),
    execution.indexOf('else')
  );
  assert.doesNotMatch(verified030Branch, /exit\s+0/);
  assert.match(execution, /\[ "\$state_033" = 'not_applied' \] \|\| exit_for_033_state/);
});

test('Billing 030 verification is pinned to the canonical text config seed', () => {
  assert.match(migration, /id TEXT PRIMARY KEY CHECK \(id = 'default'\)/);
  assert.match(migration, /VALUES\('default','SYP','SYP_NEW_2026',100,30\)/);
  assert.match(runner, /FROM billing_program_config WHERE id='default'/);
  assert.doesNotMatch(runner, /FROM billing_program_config WHERE id=1\b/);
});

test('Billing 030/033 deployment gate runs before backend build and retains production refusal', () => {
  assert.match(ensure, /Refusing Billing schema operation on the production project/);
  assert.match(ensure, /BILLING_030_033_FAILED_EXECUTION/);
  assert.match(ensure, /cloudbuild\.billing-migration\.yaml/);
  const gate = deploy.indexOf('ensure-billing-nonproduction-schema.sh');
  const backend = deploy.indexOf('cloudbuild.${environment}-backend.yaml');
  assert.ok(gate >= 0 && backend > gate);
  assert.match(deploy, /APPLY_KHEDMAH_NONPROD_030_\$\{environment\^\^\}/);
  assert.match(dockerfile, /030_billing_credits_subscriptions\.sql/);
  assert.match(dockerfile, /033_billing_admin_role\.sql/);
  assert.match(cloudbuild, /Dockerfile\.billing-migration/);
});
