import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const workflow = await readFile(new URL('../.github/workflows/production-database-role-bootstrap.yml', import.meta.url), 'utf8');
const productionOperator = await readFile(new URL('../.github/workflows/production-operator-new-account.yml', import.meta.url), 'utf8');
const wif = await readFile(new URL('../infra/iac/production_operator.tf', import.meta.url), 'utf8');
const bootstrap = await readFile(new URL('../scripts/bootstrap-new-production-project.sh', import.meta.url), 'utf8');
const secretBootstrap = await readFile(new URL('../scripts/configure-new-production-database-secret.sh', import.meta.url), 'utf8');

test('production database role bootstrap is manual, exact-main and migration-identity only', () => {
  const operationLock = workflow
    .split('      - name: Lock operation to exact latest main')[1]
    .split('      - name: Reject unapproved Production hosting region')[0];

  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request:|push:|schedule:/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /ref: \$\{\{ inputs\.commit_sha \}\}/);
  assert.match(workflow, /git rev-parse origin\/main/);
  assert.match(workflow, /OPERATIONS_MIGRATION_SERVICE_ACCOUNT/);
  assert.match(workflow, /DATABASE_URL=DATABASE_MIGRATION_URL:\$DATABASE_MIGRATION_SECRET_SELECTOR/);
  assert.match(workflow, /--service-account "\$OPERATIONS_MIGRATION_SERVICE_ACCOUNT"/);
  assert.doesNotMatch(workflow, /--service-account "\$OPERATIONS_RUNTIME_SERVICE_ACCOUNT"/);
  assert.match(workflow, /--max-retries 0/);
  assert.equal((workflow.match(/--set-env-vars "CLOUD_SQL_INSTANCE_CONNECTION_NAME=\$CLOUD_SQL_INSTANCE_CONNECTION_NAME,/g) || []).length, 6);
  assert.doesNotMatch(workflow, /DATABASE_URL=DATABASE_MIGRATION_URL:latest/);
  assert.match(workflow, /is_lower_hex "\$REQUESTED_SHA" 40/);
  assert.match(workflow, /is_lower_hex "\$DATABASE_SYSTEM_ROLE_MANIFEST_SHA256" 64/);
  assert.match(workflow, /if test "\$REQUESTED_MODE" = INVENTORY; then\n\s+DATABASE_SYSTEM_ROLE_MANIFEST_SHA256=''/);
  assert.match(workflow, /is_cloud_sql_connection_name "\$CLOUD_SQL_INSTANCE_CONNECTION_NAME"/);
  assert.match(workflow, /if test "\$REQUESTED_MODE" != PREPARE; then[\s\S]*versions describe "\$DATABASE_MIGRATION_SECRET_SELECTOR"/);
  assert.match(operationLock, /VERIFY\)\n\s+DATABASE_ROLE_PHASE=verify\n\s+DATABASE_MIGRATION_SECRET_SELECTOR=active/);
  assert.match(operationLock, /INVENTORY\)\n\s+DATABASE_ROLE_PHASE=inventory\n\s+DATABASE_MIGRATION_SECRET_SELECTOR=inventory/);
  assert.match(operationLock, /HARDEN\)[\s\S]*DATABASE_ROLE_PHASE=harden\n\s+DATABASE_MIGRATION_SECRET_SELECTOR=active/);
  assert.match(workflow, /INVENTORY:inventory\)[\s\S]*''\) DATABASE_MIGRATION_SECRET_SELECTOR=latest[\s\S]*\*\) DATABASE_MIGRATION_SECRET_SELECTOR=active/);
  assert.match(workflow, /VERIFY:active\|HARDEN:active\)[\s\S]*case "\$active_version" in ''\|\*\[!0-9\]\*\) exit 1/);
  assert.match(operationLock, /is_postgres_identifier\(\)/);
  assert.match(operationLock, /is_service_account_email\(\)/);
  assert.match(operationLock, /is_cloud_sql_connection_name\(\)/);
  assert.match(operationLock, /test "\$DATABASE_RUNTIME_USER" != postgres/);
  assert.match(operationLock, /test "\$DATABASE_MIGRATION_USER" != postgres/);
  assert.match(operationLock, /test "\$DATABASE_RUNTIME_ROLE" != cloudsqlsuperuser/);
  assert.match(operationLock, /test "\$DATABASE_MIGRATION_ROLE" != cloudsqlsuperuser/);
  assert.doesNotMatch(operationLock, /grep|=~/);
  assert.match(productionOperator, /--set-env-vars "CLOUD_SQL_INSTANCE_CONNECTION_NAME=\$CLOUD_SQL_INSTANCE_CONNECTION_NAME,DATABASE_ROLE_PHASE=verify-hardened/);
});

test('workflow descriptions containing YAML colon separators are quoted', () => {
  for (const line of workflow.split('\n')) {
    const match = line.match(/^\s*description:\s*(.+)$/);
    if (!match) continue;
    const value = match[1].trim();
    if (!value.includes(': ')) continue;
    const quoted = (value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'));
    assert.equal(quoted, true, `Unquoted YAML description with colon separator: ${line.trim()}`);
  }
});

test('ACL inspection never passes a zero-dimensional empty array to aclexplode', async () => {
  const roleBootstrap = await readFile(new URL('../scripts/production-database-role-bootstrap.sh', import.meta.url), 'utf8');
  const baseline = await readFile(new URL('../scripts/run-production-baseline-001-020.sh', import.meta.url), 'utf8');

  for (const source of [roleBootstrap, baseline]) {
    assert.doesNotMatch(source, /aclexplode\(\s*COALESCE\([^)]*'\{\}'::aclitem\[\]\)/s);
    assert.doesNotMatch(source, /\bpg_user_mapping\b/);
    assert.match(source, /\bpg_user_mappings\b/);
  }
  assert.match(roleBootstrap, /aclexplode\(relation\.relacl\)/);
  assert.match(roleBootstrap, /aclexplode\(attribute\.attacl\)/);
  assert.match(roleBootstrap, /aclexplode\(routine\.proacl\)/);
  assert.match(roleBootstrap, /aclexplode\(data_type\.typacl\)/);
});

test('PostgreSQL catalog queries never use COLLATION as an unquoted alias', async () => {
  const roleBootstrap = await readFile(new URL('../scripts/production-database-role-bootstrap.sh', import.meta.url), 'utf8');
  const baseline = await readFile(new URL('../scripts/run-production-baseline-001-020.sh', import.meta.url), 'utf8');

  for (const source of [roleBootstrap, baseline]) {
    assert.doesNotMatch(source, /\bpg_collation\s+collation\b/i);
    assert.match(source, /\bpg_collation\s+catalog_collation\b/i);
  }
});

test('prepare and harden require explicit commit-bound confirmations', () => {
  assert.match(workflow, /PREPARE_KHEDMAH_DATABASE_ROLES_/);
  assert.match(workflow, /HARDEN_KHEDMAH_DATABASE_ROLES_/);
  assert.match(workflow, /DATABASE_ROLE_PHASE=prepare/);
  assert.match(workflow, /DATABASE_ROLE_PHASE=harden/);
  assert.match(workflow, /DATABASE_ROLE_PHASE=verify/);
});

test('inventory publishes canonical manifest records and an unreviewed candidate hash', async () => {
  const script = await readFile(new URL('../scripts/production-database-role-bootstrap.sh', import.meta.url), 'utf8');
  const inventory = workflow
    .split('      - name: Publish clean-instance system-role manifest candidate')[1]
    .split('      - name: Classify resumable prepare role state')[0];

  assert.ok(inventory);
  assert.match(script, /DATABASE_SYSTEM_ROLE_MANIFEST_RECORD=%s/);
  assert.match(script, /DATABASE_SYSTEM_ROLE_MANIFEST_SHA256=%s/);
  assert.match(script, /'\|', 'D', database\.oid::text/);
  assert.match(inventory, /--order=asc/);
  assert.match(inventory, /sed -n 's\/\^DATABASE_SYSTEM_ROLE_MANIFEST_RECORD=\/\/p'/);
  assert.match(inventory, /sed -n 's\/\^DATABASE_SYSTEM_ROLE_MANIFEST_SHA256=\/\/p'/);
  assert.match(inventory, /\^\[DMRS\]\\\|\[A-Za-z0-9\\\|\+\._:-\]\+\$/);
  assert.match(inventory, /computed_sha256=.*sha256sum/);
  assert.match(inventory, /Canonical records for manual review/);
  assert.match(inventory, /Candidate SHA-256 \(not reviewed\)/);
  assert.match(inventory, /DATABASE_SYSTEM_ROLE_MANIFEST_SHA256/);
  assert.doesNotMatch(inventory, /Reviewed system-role manifest candidate/);
});

test('non-prepare role execution preserves failure and emits only bounded redacted diagnostics', () => {
  const execution = workflow
    .split('      - name: Execute database role phase once')[1]
    .split('      - name: Publish clean-instance system-role manifest candidate')[0];

  assert.ok(execution);
  assert.match(execution, /ROLE_JOB_STARTED_AT=.*date -u/);
  assert.ok(execution.indexOf('gcloud run jobs deploy') < execution.indexOf('ROLE_JOB_STARTED_AT='));
  assert.ok(execution.indexOf('ROLE_JOB_STARTED_AT=') < execution.indexOf('gcloud run jobs execute'));
  assert.match(execution, /set \+e/);
  assert.match(execution, /execution_status=0/);
  assert.match(execution, /--wait\n\s+execution_status="\$\?"\n\s+set -e/);
  assert.match(execution, /gcloud run jobs executions list/);
  assert.match(execution, /metadata\.creationTimestamp>=\\"\$ROLE_JOB_STARTED_AT\\"/);
  assert.match(execution, /--sort-by='~metadata\.creationTimestamp'/);
  assert.match(execution, /labels\.execution_name=\\"\$execution_name\\"/);
  assert.match(execution, /DATABASE_ROLE_FAILED_EXECUTION=%s/);
  assert.match(execution, /gcloud run jobs executions describe "\$execution_name"/);
  assert.match(execution, /status\.conditions\.type,status\.conditions\.status,status\.conditions\.reason,status\.conditions\.message/);
  assert.match(execution, /DATABASE_ROLE_EXECUTION_STATUS:/);
  assert.match(execution, /sed -n '1,20p' >&2 \|\| true/);
  assert.doesNotMatch(execution, /status\.conditions\.state/);
  assert.match(execution, /gcloud run jobs logs read "\$JOB"/);
  assert.match(execution, /--log-filter="\$log_filter"/);
  assert.match(execution, /--order=asc/);
  assert.match(execution, /--limit=200/);
  assert.match(execution, /\^\(ERROR:\|psql: error:\|FATAL:\|DETAIL:\|HINT:\)/);
  assert.match(execution, /\[REDACTED\]/);
  assert.match(execution, /\[REDACTED_64_HEX\]/);
  assert.match(execution, /database_url\|pgpassword\|password\|token\|secret\|credential/);
  assert.match(execution, /tail -n 80/);
  assert.match(execution, /DATABASE_ROLE_JOB_FAILED_WITHOUT_APPROVED_DIAGNOSTIC/);
  assert.match(execution, /exit "\$execution_status"/);
  assert.doesNotMatch(execution, /set -x|printenv|secrets versions access|--format=(?:json|yaml)|status\.spec|containers|\.env/);
  assert.doesNotMatch(execution, /DATABASE_SYSTEM_ROLE_MANIFEST_RECORD/);
  assert.doesNotMatch(execution, /DATABASE_SYSTEM_ROLE_MANIFEST_SHA256=.*printf/);
});

test('production WIF and bootstrap trust include the database role workflow on main', () => {
  assert.match(wif, /production-database-role-bootstrap\.yml@refs\/heads\/main/);
  assert.match(bootstrap, /production-database-role-bootstrap\.yml/);
});


test('prepare is resumable and rotates credentials around a fail-closed role cutover', async () => {
  const bootstrapTerraform = await readFile(new URL('../infra/iac/bootstrap/main.tf', import.meta.url), 'utf8');
  const stepNames = [
    'Classify resumable prepare role state',
    'Rotate migration password before runtime cutover',
    'Execute prepare database role phase once',
    'Arm runtime cutover recovery',
    'Enforce runtime cutover containment',
    'Recover ambiguous runtime containment',
    'Audit the restarted runtime cutover and fresh database',
    'Replace migration Cloud SQL superuser role after the cutover audit',
    'Finalize migration password after role cutover',
    'Verify role isolation immediately after prepare',
    'Commit verified migration secret active alias',
  ];
  const positions = stepNames.map((name) => workflow.indexOf(`      - name: ${name}`));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(positions, [...positions].sort((left, right) => left - right));

  const requestedPhase = workflow
    .split('      - name: Execute database role phase once')[1]
    .split('      - name: Publish clean-instance system-role manifest candidate')[0];
  const roleState = workflow
    .split('      - name: Classify resumable prepare role state')[1]
    .split('      - name: Rotate migration password before runtime cutover')[0];
  const transition = workflow
    .split('      - name: Rotate migration password before runtime cutover')[1]
    .split('      - name: Execute prepare database role phase once')[0];
  const preparePhase = workflow
    .split('      - name: Execute prepare database role phase once')[1]
    .split('      - name: Arm runtime cutover recovery')[0];
  const armCutover = workflow
    .split('      - name: Arm runtime cutover recovery')[1]
    .split('      - name: Enforce runtime cutover containment')[0];
  const runtimeContainment = workflow
    .split('      - name: Enforce runtime cutover containment')[1]
    .split('      - name: Recover ambiguous runtime containment')[0];
  const recoveryContainment = workflow
    .split('      - name: Recover ambiguous runtime containment')[1]
    .split('      - name: Audit the restarted runtime cutover and fresh database')[0];
  const cutover = workflow
    .split('      - name: Audit the restarted runtime cutover and fresh database')[1]
    .split('      - name: Replace migration Cloud SQL superuser role after the cutover audit')[0];
  const migrationDemotion = workflow
    .split('      - name: Replace migration Cloud SQL superuser role after the cutover audit')[1]
    .split('      - name: Finalize migration password after role cutover')[0];
  const finalRotation = workflow
    .split('      - name: Finalize migration password after role cutover')[1]
    .split('      - name: Verify role isolation immediately after prepare')[0];
  const verifyPhase = workflow
    .split('      - name: Verify role isolation immediately after prepare')[1]
    .split('      - name: Commit verified migration secret active alias')[0];
  const aliasCommit = workflow
    .split('      - name: Commit verified migration secret active alias')[1]
    .split('      - name: Publish non-secret role-bootstrap evidence')[0];

  assert.match(requestedPhase, /if: inputs\.mode != 'PREPARE'/);
  assert.match(requestedPhase, /DATABASE_URL=DATABASE_MIGRATION_URL:\$DATABASE_MIGRATION_SECRET_SELECTOR/);

  assert.match(roleState, /gcloud sql users list/);
  assert.match(roleState, /length == 3/);
  assert.match(roleState, /all\(\.\[\]; \.type == "BUILT_IN"\)/);
  assert.match(roleState, /\["postgres", \$runtime, \$migration\]/);
  assert.match(roleState, /\.name == \$expected and \.type == "BUILT_IN"/);
  assert.match(roleState, /cloudsqlsuperuser:cloudsqlsuperuser\) prepare_state=initial/);
  assert.match(roleState, /custom:cloudsqlsuperuser\) prepare_state=resume/);
  assert.match(roleState, /custom:custom\) prepare_state=completed/);
  assert.match(roleState, /Cloud SQL database role state is not a resumable PREPARE state/);

  assert.ok(transition.indexOf('gcloud secrets versions add DATABASE_MIGRATION_URL') < transition.indexOf('gcloud sql users set-password'));
  assert.ok(transition.indexOf('gcloud sql users set-password') < transition.indexOf('gcloud run jobs execute "$PROBE_JOB"'));
  assert.ok(transition.indexOf('gcloud run jobs execute "$PROBE_JOB"') < transition.indexOf('echo "version=$transition_version"'));
  assert.match(transition, /DATABASE_ROLE_PHASE=probe/);
  assert.match(transition, /DATABASE_URL=DATABASE_MIGRATION_URL:\$transition_version/);
  assert.match(transition, /password_verified=true/);
  assert.doesNotMatch(transition, /gcloud secrets update DATABASE_MIGRATION_URL/);
  assert.doesNotMatch(transition, /update-version-aliases|versionAliases|versions describe active|active_alias_committed/);
  assert.match(transition, /echo "version=\$transition_version" >> "\$GITHUB_OUTPUT"/);
  assert.match(transition, /openssl rand -hex 32/);
  assert.match(transition, /set \+x/);
  assert.equal((transition.match(/::add-mask::/g) || []).length, 2);
  assert.doesNotMatch(transition, /versions (?:disable|destroy)|cleanup_transition_version/);
  assert.doesNotMatch(transition, /versions describe latest/);

  assert.match(preparePhase, /id: prepare_database_roles/);
  assert.match(preparePhase, /steps\.prepare_role_state\.outputs\.state == 'initial'/);
  assert.match(preparePhase, /CANDIDATE_SECRET_VERSION: \$\{\{ steps\.rotate_transition_password\.outputs\.version \}\}/);
  assert.match(preparePhase, /case "\$CANDIDATE_SECRET_VERSION" in ''\|\*\[!0-9\]\*\)/);
  assert.match(preparePhase, /DATABASE_ROLE_PHASE=prepare/);
  assert.match(preparePhase, /DATABASE_URL=DATABASE_MIGRATION_URL:\$CANDIDATE_SECRET_VERSION/);

  assert.match(armCutover, /steps\.prepare_role_state\.outputs\.state == 'resume'/);
  assert.match(armCutover, /steps\.prepare_database_roles\.outcome == 'success'/);
  assert.match(armCutover, /DATABASE_RUNTIME_CUTOVER_ARMED=true/);
  assert.match(armCutover, /armed=true/);

  for (const containment of [runtimeContainment, recoveryContainment]) {
    assert.match(containment, /length == 3/);
    assert.match(containment, /all\(\.\[\]; \.type == "BUILT_IN"\)/);
    assert.match(containment, /gcloud sql users set-password postgres/);
    assert.match(containment, /openssl rand -hex 32/);
    assert.match(containment, /::add-mask::/);
    assert.match(containment, /gcloud sql users assign-roles "\$DATABASE_RUNTIME_USER"/);
    assert.match(containment, /\.databaseRoles == \[\$expected\]/);
    assert.match(containment, /gcloud sql instances restart "\$SQL_INSTANCE_NAME"/);
    assert.match(containment, /test "\$instance_ready" = true/);
    assert.match(containment, /restart_not_before_millis="\$\(date -u \+%s%3N\)"/);
    assert.match(containment, /echo "restart_not_before_millis=\$restart_not_before_millis" >> "\$GITHUB_OUTPUT"/);
    assert.match(containment, /contained=true/);
    assert.ok(containment.indexOf('restart_not_before_millis="$(date -u +%s%3N)"')
      < containment.indexOf('gcloud sql instances restart "$SQL_INSTANCE_NAME"'));
    assert.ok(containment.indexOf('gcloud sql instances restart "$SQL_INSTANCE_NAME"')
      < containment.indexOf('echo "restart_not_before_millis=$restart_not_before_millis"'));
  }
  assert.match(runtimeContainment, /continue-on-error: true/);
  assert.match(runtimeContainment, /steps\.arm_runtime_cutover\.outputs\.armed == 'true'/);
  assert.match(recoveryContainment, /if: always\(\).*steps\.runtime_containment\.outcome != 'success'/);

  assert.match(cutover, /DATABASE_ROLE_PHASE=cutover-audit/);
  assert.match(cutover, /DATABASE_RUNTIME_CUTOVER_AUDITED/);
  assert.match(cutover, /steps\.runtime_containment\.outcome == 'success'.*steps\.recover_runtime_containment\.outputs\.contained == 'true'/);
  assert.match(cutover, /DATABASE_URL=DATABASE_MIGRATION_URL:\$CANDIDATE_SECRET_VERSION/);
  assert.match(cutover, /CANDIDATE_SECRET_VERSION: \$\{\{ steps\.rotate_transition_password\.outputs\.version \}\}/);
  assert.match(cutover, /PRIMARY_CONTAINMENT_OUTCOME: \$\{\{ steps\.runtime_containment\.outcome \}\}/);
  assert.match(cutover, /PRIMARY_RESTART_NOT_BEFORE_MILLIS: \$\{\{ steps\.runtime_containment\.outputs\.restart_not_before_millis \}\}/);
  assert.match(cutover, /RECOVERY_CONTAINED: \$\{\{ steps\.recover_runtime_containment\.outputs\.contained \}\}/);
  assert.match(cutover, /RECOVERY_RESTART_NOT_BEFORE_MILLIS: \$\{\{ steps\.recover_runtime_containment\.outputs\.restart_not_before_millis \}\}/);
  assert.match(cutover, /if test "\$PRIMARY_CONTAINMENT_OUTCOME" = success; then[\s\S]*cutover_restart_not_before_millis="\$PRIMARY_RESTART_NOT_BEFORE_MILLIS"[\s\S]*test "\$RECOVERY_CONTAINED" = true[\s\S]*cutover_restart_not_before_millis="\$RECOVERY_RESTART_NOT_BEFORE_MILLIS"/);
  assert.match(cutover, /test "\$\{#cutover_restart_not_before_millis\}" -eq 13/);
  assert.match(cutover, /DATABASE_CUTOVER_RESTART_NOT_BEFORE_MILLIS=\$cutover_restart_not_before_millis/);

  assert.match(migrationDemotion, /if: always\(\).*steps\.cutover_audit\.outcome == 'success'/);
  assert.doesNotMatch(migrationDemotion, /recover_runtime_containment/);
  assert.match(migrationDemotion, /gcloud sql users assign-roles "\$DATABASE_MIGRATION_USER"/);
  assert.match(migrationDemotion, /\.databaseRoles == \[\$expected\]/);

  assert.match(finalRotation, /steps\.prepare_role_state\.outputs\.state == 'completed'/);
  assert.match(finalRotation, /steps\.demote_migration\.outcome == 'success'/);
  assert.match(finalRotation, /MIGRATION_DEMOTION_OUTCOME: \$\{\{ steps\.demote_migration\.outcome \}\}/);
  assert.match(finalRotation, /final_version="\$TRANSITION_SECRET_VERSION"/);
  assert.match(finalRotation, /initial\|resume\)[\s\S]*test "\$MIGRATION_DEMOTION_OUTCOME" = success/);
  assert.ok(finalRotation.indexOf('gcloud secrets versions add DATABASE_MIGRATION_URL') < finalRotation.indexOf('gcloud sql users set-password'));
  assert.ok(finalRotation.indexOf('gcloud sql users set-password') < finalRotation.indexOf('gcloud run jobs execute "$PROBE_JOB"'));
  assert.ok(finalRotation.indexOf('gcloud run jobs execute "$PROBE_JOB"') < finalRotation.indexOf('echo "version=$final_version"'));
  assert.match(finalRotation, /DATABASE_ROLE_PHASE=probe/);
  assert.match(finalRotation, /DATABASE_URL=DATABASE_MIGRATION_URL:\$final_version/);
  assert.match(finalRotation, /password_verified=true/);
  assert.match(finalRotation, /echo "version=\$final_version" >> "\$GITHUB_OUTPUT"/);
  assert.match(finalRotation, /openssl rand -hex 32/);
  assert.match(finalRotation, /set \+x/);
  assert.equal((finalRotation.match(/::add-mask::/g) || []).length, 2);
  assert.doesNotMatch(finalRotation, /versions (?:disable|destroy)/);
  assert.doesNotMatch(finalRotation, /gcloud secrets update DATABASE_MIGRATION_URL|update-version-aliases/);

  assert.match(verifyPhase, /id: verify_database_roles/);
  assert.match(verifyPhase, /steps\.finalize_migration_password\.outcome == 'success'/);
  assert.match(verifyPhase, /FINAL_SECRET_VERSION: \$\{\{ steps\.finalize_migration_password\.outputs\.version \}\}/);
  assert.match(verifyPhase, /DATABASE_URL=DATABASE_MIGRATION_URL:\$FINAL_SECRET_VERSION/);
  assert.doesNotMatch(verifyPhase, /DATABASE_MIGRATION_URL:latest/);

  assert.match(aliasCommit, /steps\.verify_database_roles\.outcome == 'success'/);
  assert.match(aliasCommit, /FINAL_SECRET_VERSION: \$\{\{ steps\.finalize_migration_password\.outputs\.version \}\}/);
  assert.match(aliasCommit, /versions describe "\$FINAL_SECRET_VERSION"[\s\S]*= ENABLED/);
  assert.match(aliasCommit, /--update-version-aliases=active="\$FINAL_SECRET_VERSION"/);
  assert.match(aliasCommit, /\.versionAliases\.active \/\/ empty/);
  assert.match(aliasCommit, /test "\$active_alias_committed" = true/);
  assert.doesNotMatch(aliasCommit, /versions (?:disable|destroy)/);

  assert.equal((workflow.match(/--revoke-existing-roles/g) || []).length, 3);
  assert.equal((workflow.match(/gcloud sql instances restart "\$SQL_INSTANCE_NAME"/g) || []).length, 2);
  assert.equal((workflow.match(/DATABASE_ROLE_PHASE=probe/g) || []).length, 2);
  assert.equal((workflow.match(/gcloud secrets update DATABASE_MIGRATION_URL/g) || []).length, 1);
  assert.doesNotMatch(workflow, /gcloud secrets versions (?:disable|destroy)/);
  assert.doesNotMatch(workflow, /gcloud secrets versions describe latest/);
  assert.match(bootstrapTerraform, /cloudsql\.users\.update/);
  assert.doesNotMatch(bootstrapTerraform, /roles\/cloudsql\.admin/);
});

test('new-production handoff documents the reviewed manifest and migration sequence', () => {
  const orderedTerms = [
    'INVENTORY',
    'manually review',
    'DATABASE_SYSTEM_ROLE_MANIFEST_SHA256',
    'PREPARE',
    'baseline',
    'remaining migrations',
    'HARDEN',
    'VERIFY',
  ];
  const positions = orderedTerms.map((term) => secretBootstrap.indexOf(term));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(positions, [...positions].sort((left, right) => left - right));
  assert.match(secretBootstrap, /PREPARE to probe and commit the DATABASE_MIGRATION_URL active alias/);
  assert.doesNotMatch(secretBootstrap, /PREPARE_AND_ISOLATE/);
});


test('legacy broad runtime hardening path stays retired', async () => {
  const legacy = await readFile(new URL('../scripts/harden-production-runtime-database.sh', import.meta.url), 'utf8');
  assert.match(legacy, /legacy runtime hardening path is retired/);
  assert.match(legacy, /Production Database Role Bootstrap workflow in HARDEN mode/);
  assert.doesNotMatch(legacy, /GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES/);
});


test('canonical 034 hardening excludes candidate Taxi trip schema privileges', async () => {
  const script = await readFile(new URL('../scripts/production-database-role-bootstrap.sh', import.meta.url), 'utf8');
  assert.match(script, /Taxi trip execution remains disabled in canonical schema 034/);
  assert.doesNotMatch(script, /khedmah_taxi\.jt_orders/);
  assert.doesNotMatch(script, /khedmah_taxi\.jt_quotes/);
  assert.doesNotMatch(script, /khedmah_taxi\.jt_evidence/);
  assert.doesNotMatch(script, /read_tariff_locked/);
  assert.doesNotMatch(script, /read_route_locked/);
});


test('Taxi approval table updates stay column-scoped in production hardening', async () => {
  const script = await readFile(new URL('../scripts/production-database-role-bootstrap.sh', import.meta.url), 'utf8');
  assert.match(script, /GRANT SELECT, INSERT ON TABLE[\s\S]*driver_approvals[\s\S]*vehicle_approvals/);
  assert.match(script, /GRANT UPDATE\([\s\S]*status[\s\S]*reviewed_by[\s\S]*\) ON khedmah_taxi\.driver_approvals/);
  assert.match(script, /GRANT UPDATE\([\s\S]*status[\s\S]*reviewed_by[\s\S]*\) ON khedmah_taxi\.vehicle_approvals/);
  assert.doesNotMatch(script, /GRANT SELECT, INSERT, UPDATE ON TABLE[\s\S]*driver_approvals/);
  assert.match(script, /NOT has_column_privilege\('\$RUNTIME_USER','khedmah_taxi\.driver_approvals','user_id','UPDATE'\)/);
  assert.match(script, /NOT has_column_privilege\('\$RUNTIME_USER','khedmah_taxi\.vehicle_approvals','id','UPDATE'\)/);
});

test('database role preparation is transition-safe and verification is fail-closed', async () => {
  const script = await readFile(new URL('../scripts/production-database-role-bootstrap.sh', import.meta.url), 'utf8');
  const prepare = script.split('  prepare)')[1].split('  cutover-audit)')[0];
  const cutover = script.split('  cutover-audit)')[1].split('  verify)')[0];
  const isolationQuery = script.split('verify_isolation_sql="')[1].split('"')[0];
  const loginBaseGuard = prepare
    .split("RAISE EXCEPTION 'DATABASE_ROLE_CUSTOM_ROLE_ATTRIBUTES_NOT_SAFE';")[1]
    .split("RAISE EXCEPTION 'DATABASE_ROLE_LOGIN_BASE_ATTRIBUTES_NOT_SAFE';")[0];

  assert.match(script, /database login users and privilege roles must all be distinct/);
  assert.match(script, /is_postgres_identifier\(\) \{[\s\S]*case "\$1" in[\s\S]*\*\[!A-Za-z0-9_\]\*[\s\S]*test "\$\{#1\}" -le 63/);
  assert.match(script, /is_managed_hex_password\(\) \{[\s\S]*test "\$\{#1\}" -eq 64[\s\S]*\*\[!0-9a-f\]\*/);
  assert.match(script, /is_cloud_sql_connection_name\(\) \{[\s\S]*case "\$connection_name" in[\s\S]*\*\[!a-z0-9:-\]\*/);
  assert.doesNotMatch(script, /grep -Eq/);
  assert.match(script, /PGOPTIONS='-c role=none -c search_path=pg_catalog'/);
  assert.match(script, /export PGOPTIONS/);
  assert.match(script, /DATABASE_CREDENTIALS="\$\{DATABASE_URI_REST%%@localhost\/\*\}"/);
  assert.match(script, /PSQL_DATABASE_URL="\$\{DATABASE_URI_SCHEME\}:\/\/\$\{DATABASE_CREDENTIALS\}@\/\$\{DATABASE_NAME_FROM_URL\}"/);
  assert.match(script, /PGHOST="\/cloudsql\/\$CLOUD_SQL_INSTANCE_CONNECTION_NAME"/);
  assert.doesNotMatch(script, /psql "\$DATABASE_URL"/);
  assert.match(script, /current_setting\('server_version_num'\)::integer >= 160000/);
  assert.match(script, /current_user = '\$MIGRATION_USER'/);
  assert.match(script, /session_user = '\$MIGRATION_USER'/);
  assert.match(script, /current_database\(\) = '\$DATABASE_NAME'/);
  assert.doesNotMatch(prepare, /^\s*ALTER\s+ROLE\b/im);
  assert.match(prepare, /CREATE ROLE "\$RUNTIME_ROLE" NOLOGIN NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION/);
  assert.match(prepare, /CREATE ROLE "\$MIGRATION_ROLE" NOLOGIN NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION/);
  assert.match(prepare, /rolsuper OR rolcreatedb OR rolcreaterole[\s\S]*rolreplication OR rolbypassrls/);
  assert.match(loginBaseGuard, /NOT rolcanlogin OR NOT rolinherit OR rolsuper[\s\S]*rolreplication OR rolbypassrls/);
  assert.doesNotMatch(loginBaseGuard, /rolcreatedb|rolcreaterole/);
  assert.match(prepare, /REVOKE ALL PRIVILEGES ON DATABASE "\$DATABASE_NAME" FROM PUBLIC/);
  assert.match(prepare, /REVOKE ALL ON SCHEMA public FROM PUBLIC/);
  assert.match(prepare, /GRANT CONNECT, CREATE ON DATABASE "\$DATABASE_NAME" TO "\$MIGRATION_ROLE" WITH GRANT OPTION/);
  assert.match(prepare, /GRANT USAGE, CREATE ON SCHEMA public TO "\$MIGRATION_ROLE" WITH GRANT OPTION/);
  assert.doesNotMatch(prepare, /ALTER ROLE "\$RUNTIME_USER"/);
  assert.match(prepare, /configured_role\.rolname='\$MIGRATION_USER'[\s\S]*ALTER ROLE %I IN DATABASE %I RESET ALL/);
  assert.match(prepare, /ALTER ROLE %I RESET ALL/);
  assert.match(prepare, /DATABASE_ROLE_RUNTIME_SCHEMA_NOT_SAFE/);
  assert.match(prepare, /DATABASE_ROLE_RUNTIME_CONFIG_NOT_SAFE/);
  assert.match(prepare, /DATABASE_ROLE_DELEGATION_NOT_READY/);
  assert.match(prepare, /\$prepared_runtime_acl_safe_sql/);
  assert.doesNotMatch(prepare, /\$transitional_database_access_safe_sql/);
  assert.match(prepare, /pg_has_role\('\$RUNTIME_USER','cloudsqlsuperuser','usage'\)/);
  assert.match(prepare, /pg_has_role\('\$MIGRATION_USER','cloudsqlsuperuser','usage'\)/);
  assert.match(script, /prepared_runtime_acl_safe_sql="[\s\S]*privilege\.grantee=0[\s\S]*rolname='\$RUNTIME_USER'[\s\S]*privilege\.privilege_type='CONNECT'[\s\S]*NOT privilege\.is_grantable/);
  assert.match(isolationQuery, /pg_has_role\('\$RUNTIME_USER','\$RUNTIME_ROLE','usage'\)/);
  assert.match(isolationQuery, /pg_has_role\('\$MIGRATION_USER','\$MIGRATION_ROLE','usage'\)/);
  assert.match(isolationQuery, /member with admin option/);
  assert.match(isolationQuery, /membership\.inherit_option/);
  assert.match(isolationQuery, /NOT membership\.admin_option/);
  assert.match(isolationQuery, /NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole/);
  assert.match(isolationQuery, /NOT rolreplication AND NOT rolbypassrls/);
  assert.match(isolationQuery, /AND 2 = \([\s\S]*granted_role\.rolname IN \('\$RUNTIME_ROLE', '\$MIGRATION_ROLE'\)/);
  assert.match(isolationQuery, /has_database_privilege\('\$MIGRATION_ROLE','\$DATABASE_NAME','CREATE WITH GRANT OPTION'\)/);
  assert.match(isolationQuery, /has_schema_privilege\('\$MIGRATION_ROLE','public','CREATE WITH GRANT OPTION'\)/);
  assert.match(isolationQuery, /has_database_privilege\('\$MIGRATION_USER','\$DATABASE_NAME','CREATE WITH GRANT OPTION'\)/);
  assert.match(isolationQuery, /has_schema_privilege\('\$MIGRATION_USER','public','CREATE WITH GRANT OPTION'\)/);
  assert.match(isolationQuery, /\$transitional_database_access_safe_sql/);
  assert.match(script, /transitional_database_access_safe_sql="[\s\S]*NOT has_database_privilege\('\$RUNTIME_USER','\$DATABASE_NAME','CREATE'\)/);
  assert.match(isolationQuery, /NOT has_schema_privilege\('\$RUNTIME_USER','public','CREATE'\)/);
  assert.match(isolationQuery, /\$application_login_settings_safe_sql/);
  assert.match(script, /application_login_settings_safe_sql="[\s\S]*configured_role\.rolname IN \('\$RUNTIME_USER','\$MIGRATION_USER'\)/);
  assert.match(isolationQuery, /namespace\.nspname='\$RUNTIME_USER'/);
  assert.equal((isolationQuery.match(/SELECT count\(\*\)[\s\S]*?member_role\.rolname=/g) || []).length, 2);
  assert.doesNotMatch(prepare, /\bNOSUPERUSER\b/);
  assert.match(cutover, /pg_postmaster_start_time\(\) > restart_fence\.not_before/);
  assert.match(cutover, /restart_fence\.not_before >= clock_timestamp\(\) - interval '1 hour'/);
  assert.match(cutover, /WHERE activity\.usename='\$MIGRATION_USER'/);
  assert.doesNotMatch(cutover, /activity\.usename IN \('\$RUNTIME_USER','\$MIGRATION_USER'\)/);
  assert.doesNotMatch(script, /pg_signal_backend/);
});

test('runtime hardening uses exact sequence and de-duplicated column ACL policy', async () => {
  const script = await readFile(new URL('../scripts/production-database-role-bootstrap.sh', import.meta.url), 'utf8');
  const harden = script.split('  harden)')[1];

  assert.match(script, /isolation_default_acl_safe_sql="\$default_acl_isolation_safe_sql"[\s\S]*if test "\$PHASE" = harden; then[\s\S]*isolation_default_acl_safe_sql='true'/);
  assert.match(script, /verify_isolation_sql="[\s\S]*AND \$isolation_default_acl_safe_sql/);
  assert.match(harden, /GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "\$RUNTIME_ROLE"/);
  assert.doesNotMatch(harden, /GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES/);
  assert.match(harden, /string_agg\(\s*DISTINCT quote_ident\(attribute\.attname\)/);
  assert.match(harden, /REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC/);
  assert.match(harden, /REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA khedmah_taxi FROM PUBLIC/);
  assert.match(harden, /ALTER DEFAULT PRIVILEGES REVOKE ALL ON ROUTINES FROM PUBLIC/);
  assert.match(script, /COALESCE\(routine\.proacl, acldefault\('f', routine\.proowner\)\)/);
  assert.match(script, /IF NOT EXISTS \([\s\S]*privilege\.privilege_type='CONNECT'[\s\S]*EXECUTE 'GRANT CONNECT ON DATABASE/);
  assert.ok(harden.indexOf('$runtime_hardening_ready_sql') < harden.indexOf('COMMIT;'));
});

test('database role evidence summary renders values without shell command substitution', () => {
  const summary = workflow.split('      - name: Publish non-secret role-bootstrap evidence')[1];

  assert.ok(summary);
  assert.match(summary, /printf -- '- Commit: `%s`\\n' "\$REQUESTED_SHA"/);
  assert.match(summary, /printf -- '- Mode: `%s`\\n' "\$REQUESTED_MODE"/);
  assert.match(summary, /printf -- '- Result: `%s`\\n' "\$RESULT"/);
  assert.doesNotMatch(summary, /echo\s+"[^"\n]*`/);
});

test('Cloud SQL role jobs replace the localhost placeholder with the attached Unix socket', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'khedmah-role-socket-'));
  const psqlPath = join(directory, 'psql');
  const tracePath = join(directory, 'trace');
  const scriptPath = fileURLToPath(new URL('../scripts/production-database-role-bootstrap.sh', import.meta.url));
  const managedPassword = 'a'.repeat(64);

  try {
    await writeFile(psqlPath, `#!/bin/sh
{
  printf '%s\\n' "$1"
  printf '%s\\n' "$PGHOST"
  printf '%s\\n' "$PGPORT"
  printf '%s\\n' "$PGSSLMODE"
  printf '%s\\n' "$PGOPTIONS"
} > "$TRACE_PATH"
printf '%s\\n' blocked
`);
    await chmod(psqlPath, 0o755);

    const result = spawnSync('sh', [scriptPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        TRACE_PATH: tracePath,
        PGOPTIONS: '-c search_path=public,pg_catalog',
        DATABASE_URL: `postgresql://migration_user:${managedPassword}@localhost/khedmah_ci`,
        CLOUD_SQL_INSTANCE_CONNECTION_NAME: 'khedma-dl:europe-west1:khedmah-v1-db',
        DATABASE_ROLE_PHASE: 'verify',
        DATABASE_RUNTIME_USER: 'runtime_user',
        DATABASE_MIGRATION_USER: 'migration_user',
        DATABASE_RUNTIME_ROLE: 'runtime_role',
        DATABASE_MIGRATION_ROLE: 'migration_role',
        DATABASE_NAME: 'khedmah_ci',
      },
    });

    assert.equal(result.status, 6, result.stderr);
    assert.match(result.stderr, /DATABASE_ROLE_CONNECTION_IDENTITY_NOT_READY/);
    assert.equal(await readFile(tracePath, 'utf8'), [
      `postgresql://migration_user:${managedPassword}@/khedmah_ci`,
      '/cloudsql/khedma-dl:europe-west1:khedmah-v1-db',
      '5432',
      'disable',
      '-c role=none -c search_path=pg_catalog',
      '',
    ].join('\n'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
