import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('manual readiness revalidates exact latest main after Production approval and before OIDC', async () => {
  const workflow = await read('.github/workflows/google-production-readiness.yml');
  const gateStart = workflow.indexOf('  production-secret-gate:');
  assert.ok(gateStart >= 0);
  const gate = workflow.slice(gateStart);
  const sourceCheck = gate.indexOf('Revalidate exact official latest main after Production approval');
  const auth = gate.indexOf('Authenticate to Production Google Cloud for read-only certification');
  assert.ok(sourceCheck >= 0 && auth > sourceCheck);
  assert.ok(gate.includes('test "$GITHUB_REPOSITORY" = "khedma-sy/khedmah-digital-v1"'));
  assert.ok(gate.includes('test "$GITHUB_REF" = "refs/heads/main"'));
  assert.ok(gate.includes('git fetch origin main'));
  assert.ok(gate.includes('git rev-parse origin/main'));
  assert.doesNotMatch(workflow, /lock-production-readiness-source|needs: lock-production-readiness-source/);
  assert.ok(gate.includes('id-token: write'));

  const productionWif = await read('infra/iac/production_operator.tf');
  assert.ok(productionWif.includes('google-production-readiness.yml@refs/heads/main'));
  const bootstrap = await read('scripts/bootstrap-new-production-project.sh');
  assert.ok(bootstrap.includes('.github/workflows/google-production-readiness.yml'));
  assert.ok(bootstrap.includes('github_additional_workflow_paths.value'));
});

test('canonical bootstrap enables and narrowly grants project-scoped Cloud Asset certification', async () => {
  const bootstrap = await read('infra/iac/bootstrap/main.tf');
  assert.match(bootstrap, /"cloudasset.googleapis.com"/);
  for (const permission of [
    'cloudasset.assets.analyzeIamPolicy',
    'cloudasset.assets.searchAllIamPolicies',
    'cloudasset.assets.searchAllResources',
    'iam.roles.get',
  ]) assert.ok(bootstrap.includes(permission), `missing analyzer permission ${permission}`);
  assert.match(bootstrap, /google_project_iam_custom_role" "cloud_asset_policy_analyzer"/);
  assert.match(bootstrap, /google_project_iam_member" "deployer_cloud_asset_policy_analyzer"/);
});

test('live certification pins exact distinct Terraform-created service accounts', async () => {
  const script = await read('scripts/validate-production-live-secret-certification.sh');
  for (const id of ['khedmah-v1-deployer', 'khedmah-v1-runtime', 'khedmah-v1-build', 'khedmah-v1-migrator']) {
    assert.ok(script.includes(`"${id}@$GOOGLE_CLOUD_PROJECT.iam.gserviceaccount.com"`), `missing canonical identity ${id}`);
  }
  assert.match(script, /identities must be distinct/);
  assert.match(script, /sort -u/);
});

test('live certification fails closed when inherited Secret Manager access is found or cannot be proven', async () => {
  const script = await read('scripts/validate-production-live-secret-certification.sh');
  assert.match(script, /gcloud projects get-ancestors/);
  assert.match(script, /gcloud asset analyze-iam-policy/);
  assert.ok(script.includes('--full-resource-name="$resource"'));
  assert.match(script, /--permissions=secretmanager\.versions\.access/);
  assert.match(script, /--expand-roles --expand-resources/);
  assert.doesNotMatch(script, /--expand-groups|--output-group-edges/);
  assert.match(script, /--folder=/);
  assert.match(script, /--organization=/);
  assert.match(script, /analysis_scope="project:\$GOOGLE_CLOUD_PROJECT"/);
  assert.match(script, /organization\) analysis_scope="organization:/);
  assert.match(script, /folder\) analysis_scope="folder:/);
  assert.equal((script.match(/gcloud asset analyze-iam-policy/g) ?? []).length, 1);
  assert.doesNotMatch(script, /for scope in "\$\{scopes\[@\]\}"/);
  assert.match(script, /default 20-query daily quota/);
  assert.match(script, /fullyExplored == true/);
  assert.match(script, /nonCriticalErrors/);
  assert.ok(script.includes("attachedResourceFullName != $resource"));
  assert.match(script, /refusing certification/);
});

test('live certification retains exact direct IAM checks and never reads secret payloads', async () => {
  const script = await read('scripts/validate-production-live-secret-certification.sh');
  assert.match(script, /gcloud secrets get-iam-policy/);
  assert.ok(script.includes('test "$actual_policy" = "$expected_policy"'));
  assert.match(script, /READY: SECRET_PAYLOADS_READ=0/);
  assert.doesNotMatch(script, /gcloud secrets versions access/);
});

const fixtureProject = 'certification-fixture';
const fixtureProjectNumber = '123456789012';
const aliasRoleName = `projects/${fixtureProject}/roles/khedmahDatabaseMigrationAliasManager`;
const aliasPermissions = ['secretmanager.secrets.get', 'secretmanager.secrets.update'];
const serviceAccount = (purpose) => `khedmah-v1-${purpose}@${fixtureProject}.iam.gserviceaccount.com`;
const binding = (role, purpose) => ({ role, members: [`serviceAccount:${serviceAccount(purpose)}`] });
const runtimeSecrets = [
  'DATABASE_URL', 'FIREBASE_API_KEY', 'FIREBASE_APP_ID', 'GOOGLE_MAPS_BROWSER_API_KEY', 'GOOGLE_MAPS_SERVER_API_KEY',
  'GOOGLE_OAUTH_SERVER_CLIENT_ID', 'NEXT_PUBLIC_FIREBASE_API_KEY', 'NEXT_PUBLIC_FIREBASE_APP_ID',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', 'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID', 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', 'OPERATIONS_PRODUCT_ROLE_BINDINGS', 'RESEND_API_KEY'
];
const buildSecrets = runtimeSecrets.filter((name) => name === 'GOOGLE_MAPS_BROWSER_API_KEY' || name.startsWith('NEXT_PUBLIC_FIREBASE_'));
const allSecrets = [...runtimeSecrets, 'GOOGLE_MAPS_ANDROID_API_KEY', 'DATABASE_MIGRATION_URL'];

function canonicalMetadata() {
  const policies = Object.fromEntries(runtimeSecrets.map((name) => [name, { bindings: [binding('roles/secretmanager.secretAccessor', 'runtime')] }]));
  for (const name of buildSecrets) policies[name].bindings.push(binding('roles/secretmanager.secretAccessor', 'build'));
  policies.GOOGLE_MAPS_BROWSER_API_KEY.bindings.push(binding('roles/secretmanager.secretVersionManager', 'deployer'));
  policies.GOOGLE_OAUTH_SERVER_CLIENT_ID.bindings.push(binding('roles/secretmanager.secretAccessor', 'deployer'));
  policies.GOOGLE_MAPS_ANDROID_API_KEY = { bindings: [binding('roles/secretmanager.secretAccessor', 'deployer'), binding('roles/secretmanager.secretVersionManager', 'deployer')] };
  policies.DATABASE_MIGRATION_URL = { bindings: [
    binding('roles/secretmanager.secretAccessor', 'migrator'),
    binding('roles/secretmanager.secretVersionManager', 'deployer'),
    binding(aliasRoleName, 'deployer')
  ] };
  return {
    role: { name: aliasRoleName, stage: 'GA', includedPermissions: [...aliasPermissions] },
    policies,
    analysis: Object.fromEntries(allSecrets.map((name) => [name, {
      fullyExplored: true, mainAnalysis: { fullyExplored: true, nonCriticalErrors: [], analysisResults: [{
        fullyExplored: true, attachedResourceFullName: `//secretmanager.googleapis.com/projects/${fixtureProjectNumber}/secrets/${name}`
      }] }
    }]))
  };
}

// This closed dispatcher intercepts every gcloud command. Unsupported metadata
// calls and all mutations/payload reads fail; it never invokes a real cloud CLI.
const fakeGcloud = `#!/bin/bash
set -euo pipefail
root="$CERTIFICATION_FIXTURE_ROOT"
printf '%s\\n' "$*" >>"$root/calls"
case "$*" in
  "iam service-accounts describe "*" --project ${fixtureProject} --format=value(email)")
    test "$#" -eq 7
    case "$4" in
      ${['deployer', 'runtime', 'build', 'migrator'].map(serviceAccount).join('|')}) printf '%s\\n' "$4" ;;
      *) exit 99 ;;
    esac ;;
  "auth list --filter=status:ACTIVE --format=value(account)") printf '%s\\n' '${serviceAccount('deployer')}' ;;
  "projects describe ${fixtureProject} --format=value(projectNumber)") printf '%s\\n' '${fixtureProjectNumber}' ;;
  "projects get-ancestors ${fixtureProject} --format=json") printf '%s\\n' '[{"type":"project","id":"${fixtureProjectNumber}"}]' ;;
  "iam roles describe khedmahDatabaseMigrationAliasManager --project ${fixtureProject} --format=json")
    test ! -f "$root/role-read-failure"
    cat "$root/role.json" ;;
  "secrets describe "*" --project ${fixtureProject} --format=value(name)")
    test "$#" -eq 6
    test -f "$root/policies/$3.json"
    printf 'projects/${fixtureProject}/secrets/%s\\n' "$3" ;;
  "secrets versions describe latest --secret "*" --project ${fixtureProject} --format=value(state)")
    test "$#" -eq 9
    test -f "$root/policies/$6.json"
    printf '%s\\n' ENABLED ;;
  "secrets get-iam-policy "*" --project ${fixtureProject} --format=json")
    test "$#" -eq 6
    cat "$root/policies/$3.json" ;;
  "asset analyze-iam-policy --project=${fixtureProject} --full-resource-name=//secretmanager.googleapis.com/projects/${fixtureProjectNumber}/secrets/"*" --permissions=secretmanager.versions.access --expand-roles --expand-resources --execution-timeout=60s --format=json")
    test "$#" -eq 9
    name="\${4#--full-resource-name=//secretmanager.googleapis.com/projects/${fixtureProjectNumber}/secrets/}"
    cat "$root/analysis/$name.json" ;;
  *) printf 'FORBIDDEN: %s\\n' "$*" >>"$root/calls"; exit 99 ;;
esac
`;

async function certify(mutate = () => {}) {
  const directory = await mkdtemp(join(tmpdir(), 'khedmah-secret-certification-'));
  const metadata = canonicalMetadata();
  mutate(metadata);
  try {
    for (const name of ['bin', 'policies', 'analysis']) await mkdir(join(directory, name));
    await writeFile(join(directory, 'bin/gcloud'), fakeGcloud, { mode: 0o755 });
    await writeFile(join(directory, 'calls'), '');
    await writeFile(join(directory, 'role.json'), metadata.rawRole ?? JSON.stringify(metadata.role));
    if (metadata.roleReadFailure) await writeFile(join(directory, 'role-read-failure'), '');
    for (const name of allSecrets) {
      await writeFile(join(directory, `policies/${name}.json`), JSON.stringify(metadata.policies[name]));
      await writeFile(join(directory, `analysis/${name}.json`), JSON.stringify(metadata.analysis[name]));
    }
    const result = spawnSync('/bin/bash', ['--noprofile', '--norc', fileURLToPath(new URL('../scripts/validate-production-live-secret-certification.sh', import.meta.url))], {
      encoding: 'utf8', timeout: 10000,
      env: {
        PATH: join(directory, 'bin') + ':/usr/bin:/bin', CERTIFICATION_FIXTURE_ROOT: directory,
        GOOGLE_CLOUD_PROJECT: fixtureProject, PRODUCTION_GOOGLE_CLOUD_PROJECT: fixtureProject,
        OPERATIONS_DEPLOYER_SERVICE_ACCOUNT: serviceAccount('deployer'), OPERATIONS_RUNTIME_SERVICE_ACCOUNT: serviceAccount('runtime'),
        OPERATIONS_BUILD_SERVICE_ACCOUNT: serviceAccount('build'), OPERATIONS_MIGRATION_SERVICE_ACCOUNT: serviceAccount('migrator')
      }
    });
    assert.ifError(result.error);
    const calls = (await readFile(join(directory, 'calls'), 'utf8')).trim().split('\n');
    assert.ok(!calls.some((call) => call.startsWith('FORBIDDEN:')), 'Only the reviewed metadata command allowlist may run.');
    assert.ok(!calls.some((call) => /secrets versions access|set-iam-policy|add-iam-policy-binding|roles (create|update|delete)|run jobs|sql /.test(call)));
    return { ...result, calls };
  } finally { await rm(directory, { recursive: true, force: true }); }
}

test('offline certification accepts the canonical three-binding migration policy and reads no payload', async () => {
  const result = await certify();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /READY: LIVE_SECRET_METADATA_COUNT=17/);
  assert.match(result.stdout, /READY: SECRET_PAYLOADS_READ=0/);
  assert.equal(result.calls.filter((call) => call.startsWith('iam roles describe ')).length, 1);
  assert.equal(result.calls.filter((call) => call.startsWith('asset analyze-iam-policy ')).length, 17);
});

for (const stage of [undefined, 'ALPHA', 'BETA', 'DEPRECATED', 'EAP']) {
  test(`offline certification accepts usable role stage ${stage ?? 'omitted ALPHA'} and unordered exact permissions`, async () => {
    const result = await certify(({ role }) => {
      if (stage === undefined) delete role.stage;
      else role.stage = stage;
      role.deleted = false;
      role.includedPermissions.reverse();
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /READY: LIVE_SECRET_METADATA_COUNT=17/);
  });
}

for (const [name, mutate, expectedError] of [
  ['missing alias binding', (m) => m.policies.DATABASE_MIGRATION_URL.bindings.pop(), /exact canonical role\/member allowlist/],
  ['missing migrator accessor', (m) => m.policies.DATABASE_MIGRATION_URL.bindings.shift(), /exact canonical role\/member allowlist/],
  ['missing version manager', (m) => m.policies.DATABASE_MIGRATION_URL.bindings.splice(1, 1), /exact canonical role\/member allowlist/],
  ['wrong alias role', (m) => { m.policies.DATABASE_MIGRATION_URL.bindings[2].role += 'Other'; }, /exact canonical role\/member allowlist/],
  ['cross-project alias role', (m) => { m.policies.DATABASE_MIGRATION_URL.bindings[2].role = aliasRoleName.replace(fixtureProject, 'other-project'); }, /exact canonical role\/member allowlist/],
  ['wrong alias principal', (m) => { m.policies.DATABASE_MIGRATION_URL.bindings[2].members = [`serviceAccount:${serviceAccount('runtime')}`]; }, /exact canonical role\/member allowlist/],
  ['extra direct deployer payload accessor', (m) => m.policies.DATABASE_MIGRATION_URL.bindings.push(binding('roles/secretmanager.secretAccessor', 'deployer')), /exact canonical role\/member allowlist/],
  ['public allUsers', (m) => m.policies.DATABASE_MIGRATION_URL.bindings[2].members.push('allUsers'), /public IAM principal/],
  ['public allAuthenticatedUsers', (m) => m.policies.DATABASE_MIGRATION_URL.bindings[2].members.push('allAuthenticatedUsers'), /public IAM principal/],
  ['conditional alias binding', (m) => { m.policies.DATABASE_MIGRATION_URL.bindings[2].condition = { title: 'fixture', expression: 'true' }; }, /Conditional Secret Manager IAM/],
  ['project-inherited payload permission', (m) => {
    m.analysis.DATABASE_MIGRATION_URL.mainAnalysis.analysisResults.push({ fullyExplored: true, attachedResourceFullName: `//cloudresourcemanager.googleapis.com/projects/${fixtureProjectNumber}` });
  }, /binding grants inherited Secret Manager payload access/],
  ['incomplete effective IAM analysis', (m) => { m.analysis.DATABASE_MIGRATION_URL.mainAnalysis.fullyExplored = false; }, /IAM analysis was incomplete/]
]) {
  test(`offline certification rejects ${name} without weakening other secret gates`, async () => {
    const result = await certify(mutate);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, expectedError);
    assert.doesNotMatch(result.stdout, /READY:/);
  });
}

for (const [name, mutate] of [
  ['missing role name', (m) => { delete m.role.name; }],
  ['wrong role name', (m) => { m.role.name += 'Other'; }],
  ['cross-project role definition', (m) => { m.role.name = aliasRoleName.replace(fixtureProject, 'other-project'); }],
  ['expanded payload permission', (m) => m.role.includedPermissions.push('secretmanager.versions.access')],
  ['expanded IAM mutation permission', (m) => m.role.includedPermissions.push('secretmanager.secrets.setIamPolicy')],
  ['missing update permission', (m) => m.role.includedPermissions.pop()],
  ['duplicate permission metadata', (m) => m.role.includedPermissions.push(aliasPermissions[0])],
  ['missing permission metadata', (m) => { delete m.role.includedPermissions; }],
  ['deleted role', (m) => { m.role.deleted = true; }],
  ['null deleted state', (m) => { m.role.deleted = null; }],
  ['malformed deleted state', (m) => { m.role.deleted = 'false'; }],
  ['disabled role', (m) => { m.role.stage = 'DISABLED'; }],
  ['null stage', (m) => { m.role.stage = null; }],
  ['unknown stage', (m) => { m.role.stage = 'UNKNOWN'; }],
  ['non-string stage', (m) => { m.role.stage = ['GA']; }],
  ['malformed JSON', (m) => { m.rawRole = '{'; }],
  ['multiple role documents', (m) => { m.rawRole = JSON.stringify(m.role) + '\n' + JSON.stringify(m.role); }],
  ['non-object role metadata', (m) => { m.rawRole = 'null'; }]
]) {
  test(`offline certification rejects ${name} before reading secret metadata`, async () => {
    const result = await certify(mutate);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Migration alias role definition differs from the exact canonical permissions or usable lifecycle/);
    assert.doesNotMatch(result.stdout, /READY:/);
    assert.ok(!result.calls.some((call) => call.startsWith('secrets ') || call.startsWith('asset ')));
  });
}

test('offline certification refuses role lookup failure without a fallback or success marker', async () => {
  const result = await certify((metadata) => { metadata.roleReadFailure = true; });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Could not read the canonical migration alias role definition; refusing certification/);
  assert.doesNotMatch(result.stdout, /READY:/);
  assert.equal(result.calls.filter((call) => call.startsWith('iam roles describe ')).length, 1);
  assert.ok(!result.calls.some((call) => call.startsWith('secrets ') || call.startsWith('asset ')));
});
