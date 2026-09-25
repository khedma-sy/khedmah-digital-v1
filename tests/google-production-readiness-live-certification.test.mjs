import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

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
