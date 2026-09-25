import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('new-account bootstrap grants the reader role required to inspect user-managed service-account keys', async () => {
  const bootstrap = await read('infra/iac/bootstrap/main.tf');
  assert.match(bootstrap, /roles\/iam\.serviceAccountViewer/);
  assert.doesNotMatch(bootstrap, /"roles\/(owner|editor)"/);
});

test('bootstrap admin proves live secret IAM before any Cloud Run secret mutation', async () => {
  const workflow = await read('.github/workflows/production-bootstrap-admin.yml');
  const preflight = workflow.indexOf('Verify bootstrap secret IAM before mutation');
  const bind = workflow.indexOf('Bind the one-time bootstrap secret to the active backend revision');
  assert.ok(preflight >= 0 && bind > preflight, 'IAM preflight must run before bootstrap secret binding');
  assert.match(workflow, /gcloud secrets get-iam-policy BOOTSTRAP_ADMIN_SECRET/);
  assert.match(workflow, /roles\/secretmanager\.secretAccessor/);
  assert.match(workflow, /roles\/secretmanager\.secretVersionManager/);
  assert.match(workflow, /OPERATIONS_RUNTIME_SERVICE_ACCOUNT/);
  assert.match(workflow, /gcloud auth list/);
});

test('production deployment readiness verifies migration identity and all permanent new-account Secret Manager inputs', async () => {
  const readiness = await read('scripts/validate-production-deployment-readiness.sh');
  assert.match(readiness, /OPERATIONS_MIGRATION_SERVICE_ACCOUNT/);
  assert.match(readiness, /gcloud iam service-accounts describe "\$OPERATIONS_MIGRATION_SERVICE_ACCOUNT"/);
  for (const secret of [
    'DATABASE_URL',
    'DATABASE_MIGRATION_URL',
    'FIREBASE_API_KEY',
    'FIREBASE_APP_ID',
    'GOOGLE_MAPS_ANDROID_API_KEY',
    'GOOGLE_MAPS_BROWSER_API_KEY',
    'GOOGLE_OAUTH_SERVER_CLIENT_ID',
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_APP_ID',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID',
    'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
    'OPERATIONS_PRODUCT_ROLE_BINDINGS',
    'RESEND_API_KEY'
  ]) assert.ok(readiness.includes(secret), `missing readiness secret ${secret}`);
  assert.doesNotMatch(readiness, /secrets versions access/);
});

test('new-account secret contract retains the Maps server key required by production Google config', async () => {
  const inventory = await read('infra/secrets/required-secrets.yaml');
  const bootstrapVars = await read('infra/iac/bootstrap/variables.tf');
  const readiness = await read('scripts/validate-production-deployment-readiness.sh');
  const googleGate = await read('.github/workflows/google-production-readiness.yml');
  const live = await read('scripts/production-operator-live-validation.sh');
  const maps = await read('config/google/maps.ts');
  const productionEnv = await read('.env.production');
  assert.match(inventory, /DATABASE_MIGRATION_URL/);
  assert.match(productionEnv, /^GOOGLE_MAPS_SERVER_API_KEY=$/m);
  assert.match(maps, /requireEnvironment\("GOOGLE_MAPS_SERVER_API_KEY"/);
  for (const source of [inventory, bootstrapVars, readiness, googleGate, live]) {
    assert.match(source, /GOOGLE_MAPS_SERVER_API_KEY/);
  }
});


test('new-account deployer gets only the custom permission needed to read media bucket IAM', async () => {
  const bootstrap = await read('infra/iac/bootstrap/main.tf');
  assert.match(bootstrap, /storage_bucket_policy_viewer/);
  assert.match(bootstrap, /storage\.buckets\.getIamPolicy/);
  const custom = bootstrap.split('resource "google_project_iam_custom_role" "storage_bucket_policy_viewer"')[1]?.split('resource "google_project_iam_member" "deployer_storage_bucket_policy_viewer"')[0] ?? '';
  assert.doesNotMatch(custom, /storage\.buckets\.setIamPolicy|storage\.buckets\.update|storage\.objects\./);
});

test('Production readiness verifies the private durable media bucket and runtime binding', async () => {
  const readiness = await read('scripts/validate-production-deployment-readiness.sh');
  assert.match(readiness, /GCS_MEDIA_BUCKET is required/);
  assert.match(readiness, /GCS_MEDIA_LOCATION is required/);
  assert.match(readiness, /gcloud storage buckets describe "gs:\/\/\$\{GCS_MEDIA_BUCKET\}"/);
  assert.match(readiness, /public_access_prevention/);
  assert.match(readiness, /uniform_bucket_level_access|uniformBucketLevelAccess/);
  assert.match(readiness, /versioning_enabled|versioning\.enabled/);
  assert.match(readiness, /gcloud storage buckets get-iam-policy/);
  assert.match(readiness, /roles\/storage\.objectAdmin/);
  assert.match(readiness, /allUsers/);
  assert.match(readiness, /allAuthenticatedUsers/);
  assert.doesNotMatch(readiness, /storage buckets set-iam-policy/);
});


test('Production readiness validates runtime identity before media IAM evaluation', async () => {
  const readiness = await read('scripts/validate-production-deployment-readiness.sh');
  const runtimeCheck = readiness.indexOf('Runtime service account is outside the approved project.');
  const mediaPolicy = readiness.indexOf('gcloud storage buckets get-iam-policy');
  assert.ok(runtimeCheck >= 0 && mediaPolicy > runtimeCheck);
  assert.match(readiness, /OPERATIONS_RUNTIME_SERVICE_ACCOUNT.*GOOGLE_CLOUD_PROJECT/s);
});


test('bootstrap secret version is never disabled unless Cloud Run secret cleanup succeeded', async () => {
  const workflow = await read('.github/workflows/production-bootstrap-admin.yml');
  const cleanup = workflow.indexOf('id: cleanup');
  const disable = workflow.indexOf('Disable the one-time bootstrap secret after account creation');
  assert.ok(cleanup >= 0 && disable > cleanup);
  assert.match(workflow, /steps\.cleanup\.outcome == 'success'/);
});


test('Production readiness binds the media bucket to the active Google project number', async () => {
  const readiness = await read('scripts/validate-production-deployment-readiness.sh');
  assert.match(readiness, /gcloud projects describe "\$GOOGLE_CLOUD_PROJECT".*projectNumber/);
  assert.match(readiness, /gcloud storage buckets list/);
  assert.match(readiness, /--project "\$GOOGLE_CLOUD_PROJECT"/);
  assert.match(readiness, /MEDIA_BUCKET_IN_PROJECT/);
  assert.match(readiness, /Media bucket is not owned by the approved Google Cloud project/);
});


test('manual Production deploy supplies every newly required live-readiness input', async () => {
  const deploy = await read('scripts/google-production-deploy.sh');
  for (const name of ['OPERATIONS_MIGRATION_SERVICE_ACCOUNT','GCS_MEDIA_BUCKET','GCS_MEDIA_LOCATION']) {
    assert.ok(deploy.includes(name), `manual deploy is missing ${name}`);
  }
  assert.match(deploy, /Migration service account must belong to the active Production project/);
  assert.doesNotMatch(deploy, /GCS_MEDIA_LOCATION\"?\s*==\s*\"?\$GOOGLE_CLOUD_REGION/);
  assert.doesNotMatch(deploy, /Media bucket location must match the active Production region/);
  const readiness = await read('scripts/validate-production-deployment-readiness.sh');
  assert.match(readiness, /--arg location \"\$\{GCS_MEDIA_LOCATION\^\^\}\"/);
  assert.match(readiness, /\.location == \$location/);
});


test('VERIFY_ONLY accepts a clean first-deploy state but rejects a partial Cloud Run pair', async () => {
  const readiness = await read('scripts/validate-production-deployment-readiness.sh');
  assert.match(readiness, /missing_services\[@\]\} == 1|#missing_services\[@\].*== 1/s);
  assert.match(readiness, /Production Cloud Run service pair is inconsistent/);
  assert.match(readiness, /missing_services\[@\]\} == 2|#missing_services\[@\].*== 2/s);
  assert.match(readiness, /FIRST_DEPLOY_MISSING_SERVICES/);
  assert.equal((readiness.match(/READY: CLOUD_RUN_SERVICES/g) ?? []).length, 1, 'Cloud Run readiness must be emitted only from the zero-missing branch');
  assert.doesNotMatch(readiness, /ALLOW_FIRST_PRODUCTION_DEPLOY/);

  const operator = await read('.github/workflows/production-operator-new-account.yml');
  const manualDeploy = await read('scripts/google-production-deploy.sh');
  assert.doesNotMatch(operator, /ALLOW_FIRST_PRODUCTION_DEPLOY/);
  assert.doesNotMatch(manualDeploy, /ALLOW_FIRST_PRODUCTION_DEPLOY/);
});


test('VERIFY_ONLY is pinned to refs/heads/main and exact origin/main before Google authentication', async () => {
  const workflow = await read('.github/workflows/production-operator-new-account.yml');
  const lock = workflow.indexOf('test "$GITHUB_REF" = "refs/heads/main"');
  const head = workflow.indexOf('test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)"');
  const auth = workflow.indexOf('Authenticate to Google Cloud');
  assert.ok(lock >= 0 && head > lock && auth > head, 'source lock must run before Google authentication');
});


test('root-state absence accepts only confirmed not-found and rejects lookup errors', async () => {
  const plan = await read('scripts/plan-media-storage.sh');
  assert.match(plan, /gcloud storage objects describe/);
  assert.match(plan, /ROOT_STATE_ABSENCE_CHECK_FAILED/);
  assert.match(plan, /NOT_FOUND\|not found\|404\|matched no objects\|does not exist/);
  assert.doesNotMatch(plan, /gcloud storage ls --all-versions "\$root_state_uri" >\/dev\/null 2>&1/);
});

test('Cloud Run first-deploy detection distinguishes not-found from lookup failures', async () => {
  const readiness = await read('scripts/validate-production-deployment-readiness.sh');
  assert.match(readiness, /Cloud Run service lookup failed for \$service; refusing to classify it as missing/);
  assert.match(readiness, /NOT_FOUND\|not found\|Cannot find service\|404/);
  assert.match(readiness, /Cloud Run service identity mismatch/);
  assert.doesNotMatch(readiness, /--format='value\(metadata\.name\)' >\/dev\/null 2>&1/);
});


test('live Secret Manager certification script parses as valid Bash', async () => {
  const scriptPath = new URL('../scripts/validate-production-live-secret-certification.sh', import.meta.url);
  assert.doesNotThrow(() => execFileSync('bash', ['-n', fileURLToPath(scriptPath)]));
});
