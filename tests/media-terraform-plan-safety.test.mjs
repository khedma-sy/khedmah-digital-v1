import assert from 'node:assert/strict';
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const repoRoot = dirname(fileURLToPath(import.meta.url));

const run = (command, args, options) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });

const runPlanWithMocks = async (t, overrides = {}) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'khedmah-media-plan-test-'));
  const bin = join(sandbox, 'bin');
  const planMarker = join(sandbox, 'plan-called');
  const publishedPlan = join(sandbox, 'approved-media.tfplan');
  const legacyReadCount = join(sandbox, 'legacy-read-count');
  await mkdir(bin);
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  const mocks = {
    gcloud: `#!/usr/bin/env bash
set -eu
if [[ "$1 $2 $3" == "storage buckets describe" && "$4" == "gs://state-bucket" ]]; then
  printf '%s\\n' "$MOCK_STATE_BUCKET_JSON"
elif [[ "$1 $2 $3" == "iam service-accounts describe" ]]; then
  printf '%s\\n' "$OPERATIONS_RUNTIME_SERVICE_ACCOUNT"
elif [[ "$1 $2 $3" == "storage buckets list" ]]; then
  [[ "$MOCK_BUCKET_LIST_STATUS" == "success" ]] || exit 9
  printf '%s' "$MOCK_EXISTING_BUCKETS"
else
  exit 1
fi
`,
    jq: `#!/usr/bin/env bash
set -eu
if [[ "\${1:-}" == "-e" || "\${2:-}" == *".lineage"* ]]; then
  exec /usr/bin/jq "$@"
elif [[ "\${1:-}" == "-r" ]]; then
  cat >/dev/null
  if [[ "$2" == *'index("delete")'* ]]; then
    printf '%s' "$MOCK_PLAN_DELETES"
  else
    printf '%s' "$MOCK_PLAN_RESOURCES"
  fi
elif [[ "\${1:-}" == "-er" ]]; then
  cat >/dev/null
  if [[ "$2" == *"planned_values"* && "$2" == *"google_storage_bucket.media"* ]]; then
    printf '%s\\n' "$MOCK_PLANNED_MEDIA_IDENTITY"
  elif [[ "$2" == *"planned_values"* && "$2" == *"google_storage_bucket_iam_member.runtime_media_objects"* ]]; then
    printf '%s\\n' "$MOCK_PLANNED_RUNTIME_IDENTITY"
  elif [[ "$2" == *"google_storage_bucket.media"* ]]; then
    printf '%s\\n' "$MOCK_MEDIA_IDENTITY"
  elif [[ "$2" == *"google_storage_bucket_iam_member.runtime_media_objects"* ]]; then
    printf '%s\\n' "$MOCK_RUNTIME_IDENTITY"
  else
    exit 2
  fi
fi
`,
    terraform: `#!/usr/bin/env bash
set -eu
[[ "\${TF_WORKSPACE:-}" == "default" ]] || exit 11
[[ "\${TF_DATA_DIR:-}" == /* ]] || exit 12
if [[ "$1" == "-chdir=infra/iac" ]]; then
  case "$2" in
    init) exit 0 ;;
    state)
      [[ "$3" == "pull" ]]
      [[ "$MOCK_LEGACY_STATE_STATUS" == "success" ]] || exit 8
      count=0
      if [[ -f "$MOCK_LEGACY_READ_COUNT" ]]; then
        count="$(/usr/bin/cat "$MOCK_LEGACY_READ_COUNT")"
      fi
      count=$((count + 1))
      printf '%s' "$count" > "$MOCK_LEGACY_READ_COUNT"
      if (( count > 1 )); then
        printf '%s' "$MOCK_LEGACY_STATE_JSON_AFTER"
      else
        printf '%s' "$MOCK_LEGACY_STATE_JSON"
      fi
      ;;
    *) exit 2 ;;
  esac
  exit 0
fi
case "$2" in
  init|validate) exit 0 ;;
  state)
    [[ "$3" == "list" ]]
    printf '%s' "$MOCK_STATE_RESOURCES"
    ;;
  show) printf '%s\\n' '{}' ;;
  plan)
    for argument in "$@"; do
      if [[ "$argument" == -out=* ]]; then
        printf '%s' 'mock plan' > "\${argument#-out=}"
        printf '%s' "\${argument#-out=}" > "$MOCK_PLAN_MARKER"
      fi
    done
    ;;
  *) exit 2 ;;
esac
`,
  };

  for (const [name, body] of Object.entries(mocks)) {
    const path = join(bin, name);
    await writeFile(path, body);
    await chmod(path, 0o755);
  }

  const result = await run('bash', ['scripts/plan-media-storage.sh'], {
    cwd: join(repoRoot, '..'),
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      GOOGLE_CLOUD_PROJECT: 'khedmah-test-project',
      GOOGLE_CLOUD_REGION: 'me-central1',
      GCS_MEDIA_LOCATION: 'europe-west1',
      TF_STATE_BUCKET: 'state-bucket',
      TF_PLAN_FILE: relative(join(repoRoot, '..'), publishedPlan),
      GCS_MEDIA_BUCKET: 'requested-media-bucket',
      OPERATIONS_RUNTIME_SERVICE_ACCOUNT:
        'runtime@khedmah-test-project.iam.gserviceaccount.com',
      LEGACY_ROOT_STATE_LINEAGE: 'reviewed-lineage',
      LEGACY_ROOT_STATE_SERIAL: '42',
      MOCK_LEGACY_STATE_STATUS: 'success',
      MOCK_LEGACY_STATE_JSON:
        '{"version":4,"terraform_version":"1.6.6","serial":42,"lineage":"reviewed-lineage","outputs":{},"resources":[]}',
      MOCK_LEGACY_STATE_JSON_AFTER:
        '{"version":4,"terraform_version":"1.6.6","serial":42,"lineage":"reviewed-lineage","outputs":{},"resources":[]}',
      MOCK_LEGACY_READ_COUNT: legacyReadCount,
      MOCK_STATE_BUCKET_JSON:
        '{"iamConfiguration":{"uniformBucketLevelAccess":{"enabled":true},"publicAccessPrevention":"enforced"},"versioning":{"enabled":true}}',
      MOCK_STATE_RESOURCES: 'google_storage_bucket.media\n',
      MOCK_MEDIA_IDENTITY: 'requested-media-bucket\tkhedmah-test-project\teurope-west1',
      MOCK_RUNTIME_IDENTITY:
        'requested-media-bucket\tserviceAccount:runtime@khedmah-test-project.iam.gserviceaccount.com',
      MOCK_BUCKET_LIST_STATUS: 'success',
      MOCK_EXISTING_BUCKETS: '',
      MOCK_PLAN_RESOURCES: '',
      MOCK_PLAN_DELETES: '',
      MOCK_PLANNED_MEDIA_IDENTITY:
        'requested-media-bucket\tkhedmah-test-project\teurope-west1',
      MOCK_PLANNED_RUNTIME_IDENTITY:
        'requested-media-bucket\tserviceAccount:runtime@khedmah-test-project.iam.gserviceaccount.com',
      MOCK_PLAN_MARKER: planMarker,
      ...overrides,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return { ...result, planMarker, publishedPlan };
};

test('media infrastructure is isolated from the legacy root Terraform state', async () => {
  const root = await read('../infra/iac/main.tf');
  const rootVersions = await read('../infra/iac/versions.tf');
  const media = await read('../infra/iac/media/main.tf');
  assert.doesNotMatch(root, /google_storage_bucket" "media/);
  assert.match(rootVersions, /backend "gcs"/);
  assert.match(media, /google_storage_bucket" "media/);
});

test('media plan requires protected remote state and performs no apply', async () => {
  const script = await read('../scripts/plan-media-storage.sh');
  assert.match(script, /TF_STATE_BUCKET:\?TF_STATE_BUCKET is required/);
  assert.match(script, /publicAccessPrevention == "enforced"/);
  assert.match(script, /public_access_prevention == "enforced"/);
  assert.match(script, /uniformBucketLevelAccess\.enabled == true/);
  assert.match(script, /uniform_bucket_level_access == true/);
  assert.match(script, /versioning\.enabled == true/);
  assert.match(script, /versioning_enabled == true/);
  assert.match(script, /TERRAFORM_STATE_BUCKET_PROTECTIONS_UNVERIFIED/);
  assert.match(script, /media_terraform plan/);
  assert.match(script, /EXISTING_MEDIA_BUCKET_REQUIRES_REVIEWED_STATE_HANDOFF/);
  assert.match(script, /media_terraform show -json/);
  assert.match(script, /TRACKED_MEDIA_BUCKET_MISMATCH/);
  assert.match(script, /TRACKED_MEDIA_PROJECT_MISMATCH/);
  assert.match(script, /TRACKED_MEDIA_LOCATION_MISMATCH/);
  assert.match(script, /TRACKED_RUNTIME_MEMBER_MISMATCH/);
  assert.match(script, /MEDIA_BUCKET_EXISTENCE_CHECK_FAILED/);
  assert.match(script, /UNEXPECTED_TERRAFORM_STATE_PREFIX/);
  assert.match(script, /LEGACY_ROOT_MEDIA_STATE_HANDOFF_INCOMPLETE/);
  assert.match(script, /LEGACY_ROOT_STATE_QUERY_FAILED/);
  assert.match(script, /LEGACY_ROOT_STATE_LINEAGE_MISMATCH/);
  assert.match(script, /LEGACY_ROOT_STATE_SERIAL_MISMATCH/);
  assert.match(script, /LEGACY_ROOT_STATE_CHANGED_DURING_PLAN/);
  assert.match(script, /root_terraform init/);
  assert.match(script, /backend-config="prefix=\$\{EXPECTED_LEGACY_ROOT_STATE_PREFIX\}"/);
  assert.match(script, /root_terraform state pull/);
  assert.match(script, /TF_WORKSPACE=default/);
  assert.match(script, /TF_DATA_DIR="\$root_tf_data_dir"/);
  assert.match(script, /TF_DATA_DIR="\$media_tf_data_dir"/);
  assert.match(script, /pwd -P/);
  assert.match(script, /UNEXPECTED_MEDIA_STATE_RESOURCES/);
  assert.match(script, /UNEXPECTED_MEDIA_PLAN_RESOURCES/);
  assert.match(script, /DESTRUCTIVE_MEDIA_PLAN_CHANGES/);
  assert.match(script, /pending_plan_file/);
  assert.match(script, /OPERATIONS_RUNTIME_SERVICE_ACCOUNT/);
  assert.doesNotMatch(script, /terraform -chdir=infra\/iac\/media apply/);
});

test('media plan and production deployment share canonical bucket and runtime inputs', async () => {
  const plan = await read('../scripts/plan-media-storage.sh');
  const readiness = await read('../scripts/validate-media-storage-readiness.sh');
  const deploy = await read('../scripts/google-production-deploy.sh');

  assert.match(plan, /GCS_MEDIA_BUCKET:\?GCS_MEDIA_BUCKET is required/);
  assert.match(plan, /GCS_MEDIA_LOCATION:\?GCS_MEDIA_LOCATION is required/);
  assert.match(plan, /OPERATIONS_RUNTIME_SERVICE_ACCOUNT:\?OPERATIONS_RUNTIME_SERVICE_ACCOUNT is required/);
  assert.match(readiness, /GCS_MEDIA_BUCKET:\?GCS_MEDIA_BUCKET is required/);
  assert.match(readiness, /versioning_enabled/);
  assert.match(readiness, /retentionDurationSeconds == "2592000"/);
  assert.match(readiness, /allAuthenticatedUsers/);
  assert.match(readiness, /has\("condition"\) \| not/);
  assert.match(readiness, /GCS_MEDIA_LOCATION:\?GCS_MEDIA_LOCATION is required/);
  assert.match(readiness, /OPERATIONS_RUNTIME_SERVICE_ACCOUNT:\?OPERATIONS_RUNTIME_SERVICE_ACCOUNT is required/);
  assert.match(deploy, /GCS_MEDIA_BUCKET:\?GCS_MEDIA_BUCKET is required/);
  assert.match(deploy, /_GCS_MEDIA_BUCKET=\$\{GCS_MEDIA_BUCKET\}/);
});

test('isolated media stack pins its provider selections', async () => {
  const lock = await read('../infra/iac/media/.terraform.lock.hcl');
  assert.match(lock, /registry\.terraform\.io\/hashicorp\/google/);
  assert.match(lock, /version\s+=\s+"6\./);
});

test('media plan proceeds only after every state ownership check succeeds', async (t) => {
  const result = await runPlanWithMocks(t);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /READY: MEDIA_TERRAFORM_PLAN=/);
  assert.match(result.stdout, /NO_TERRAFORM_APPLY/);
  const invokedPlanPath = await readFile(result.planMarker, 'utf8');
  assert.ok(isAbsolute(invokedPlanPath));
  assert.notEqual(invokedPlanPath, result.publishedPlan);
  await readFile(result.publishedPlan);
});

test('media plan accepts the flat gcloud bucket protection schema used in production', async (t) => {
  const result = await runPlanWithMocks(t, {
    MOCK_STATE_BUCKET_JSON:
      '{"uniform_bucket_level_access":true,"public_access_prevention":"enforced","versioning_enabled":true}',
  });

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /READY: MEDIA_TERRAFORM_PLAN=/);
});

test('media plan separates the production runtime region from the bucket location', async (t) => {
  const result = await runPlanWithMocks(t, {
    GOOGLE_CLOUD_REGION: 'me-central1',
    GCS_MEDIA_LOCATION: 'europe-west1',
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /READY: MEDIA_TERRAFORM_PLAN=/);
  await readFile(result.publishedPlan);
});

test('media plan rejects an unapproved bucket location', async (t) => {
  const result = await runPlanWithMocks(t, { GCS_MEDIA_LOCATION: 'me-central1' });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /EXPECTED_MEDIA_LOCATION=europe-west1/);
  await assert.rejects(readFile(result.planMarker));
});

test('media plan ignores an inherited non-default Terraform workspace', async (t) => {
  const result = await runPlanWithMocks(t, { TF_WORKSPACE: 'wrong-workspace' });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /READY: MEDIA_TERRAFORM_PLAN=/);
  await readFile(result.publishedPlan);
});

test('media plan stops when state tracks a different bucket name', async (t) => {
  const result = await runPlanWithMocks(t, {
    MOCK_MEDIA_IDENTITY: 'tracked-media-bucket\tkhedmah-test-project\teurope-west1',
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /TRACKED_MEDIA_BUCKET_MISMATCH/);
  assert.match(result.stderr, /NO_TERRAFORM_PLAN_CREATED/);
  await assert.rejects(readFile(result.planMarker));
});

test('media plan stops when state tracks a different project', async (t) => {
  const result = await runPlanWithMocks(t, {
    MOCK_MEDIA_IDENTITY: 'requested-media-bucket\twrong-project\teurope-west1',
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /TRACKED_MEDIA_PROJECT_MISMATCH/);
  await assert.rejects(readFile(result.planMarker));
});

test('media plan stops when state tracks a different location', async (t) => {
  const result = await runPlanWithMocks(t, {
    MOCK_MEDIA_IDENTITY: 'requested-media-bucket\tkhedmah-test-project\tUS',
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /TRACKED_MEDIA_LOCATION_MISMATCH/);
  await assert.rejects(readFile(result.planMarker));
});

test('media plan rejects an unexpected remote state prefix', async (t) => {
  const result = await runPlanWithMocks(t, {
    TF_STATE_PREFIX: 'khedmah/production/wrong-stack',
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /UNEXPECTED_TERRAFORM_STATE_PREFIX/);
  await assert.rejects(readFile(result.planMarker));
});

test('media plan stops while the legacy root state still owns media resources', async (t) => {
  const result = await runPlanWithMocks(t, {
    MOCK_LEGACY_STATE_JSON:
      '{"version":4,"serial":42,"lineage":"reviewed-lineage","resources":[{"mode":"managed","type":"google_storage_bucket","name":"media","instances":[]}]}',
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /LEGACY_ROOT_MEDIA_STATE_HANDOFF_INCOMPLETE/);
  assert.match(result.stderr, /NO_TERRAFORM_PLAN_CREATED/);
  await assert.rejects(readFile(result.planMarker));
});

test('media plan rejects a different legacy root state lineage', async (t) => {
  const mismatchedState =
    '{"version":4,"serial":42,"lineage":"unreviewed-lineage","resources":[]}';
  const result = await runPlanWithMocks(t, {
    MOCK_LEGACY_STATE_JSON: mismatchedState,
    MOCK_LEGACY_STATE_JSON_AFTER: mismatchedState,
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /LEGACY_ROOT_STATE_LINEAGE_MISMATCH/);
  assert.match(result.stderr, /NO_TERRAFORM_PLAN_CREATED/);
  await assert.rejects(readFile(result.planMarker));
});

test('media plan rejects a legacy root state change during planning', async (t) => {
  const result = await runPlanWithMocks(t, {
    MOCK_LEGACY_STATE_JSON_AFTER:
      '{"version":4,"serial":43,"lineage":"reviewed-lineage","resources":[]}',
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /LEGACY_ROOT_STATE_CHANGED_DURING_PLAN BEFORE=42 AFTER=43/);
  assert.match(result.stderr, /NO_APPROVED_TERRAFORM_PLAN/);
  assert.doesNotMatch(result.stdout, /READY: MEDIA_TERRAFORM_PLAN=/);
  await readFile(result.planMarker);
  await assert.rejects(readFile(result.publishedPlan));
});

test('media plan rejects a stale legacy root state serial', async (t) => {
  const result = await runPlanWithMocks(t, {
    LEGACY_ROOT_STATE_SERIAL: '43',
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /LEGACY_ROOT_STATE_SERIAL_MISMATCH EXPECTED=43 ACTUAL=42/);
  assert.match(result.stderr, /NO_TERRAFORM_PLAN_CREATED/);
  await assert.rejects(readFile(result.planMarker));
});

test('media plan fails closed when the canonical legacy root state cannot be queried', async (t) => {
  const result = await runPlanWithMocks(t, {
    MOCK_LEGACY_STATE_STATUS: 'failure',
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /LEGACY_ROOT_STATE_QUERY_FAILED/);
  assert.match(result.stderr, /NO_TERRAFORM_PLAN_CREATED/);
  await assert.rejects(readFile(result.planMarker));
});

test('media plan rejects every resource outside the isolated stack allowlist', async (t) => {
  const result = await runPlanWithMocks(t, {
    MOCK_STATE_RESOURCES:
      'google_storage_bucket.media\ngoogle_project_service.unrelated\n',
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /UNEXPECTED_MEDIA_STATE_RESOURCES=google_project_service\.unrelated/);
  assert.match(result.stderr, /NO_TERRAFORM_PLAN_CREATED/);
  await assert.rejects(readFile(result.planMarker));
});

test('media plan stops before planning when the bucket existence check fails', async (t) => {
  const result = await runPlanWithMocks(t, {
    MOCK_STATE_RESOURCES: '',
    MOCK_BUCKET_LIST_STATUS: 'failure',
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /MEDIA_BUCKET_EXISTENCE_CHECK_FAILED/);
  assert.match(result.stderr, /NO_TERRAFORM_PLAN_CREATED/);
  await assert.rejects(readFile(result.planMarker));
});

test('media plan stops when state tracks a different runtime member', async (t) => {
  const result = await runPlanWithMocks(t, {
    MOCK_STATE_RESOURCES:
      'google_storage_bucket.media\ngoogle_storage_bucket_iam_member.runtime_media_objects\n',
    MOCK_RUNTIME_IDENTITY:
      'requested-media-bucket\tserviceAccount:wrong@khedmah-test-project.iam.gserviceaccount.com',
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /TRACKED_RUNTIME_MEMBER_MISMATCH/);
  await assert.rejects(readFile(result.planMarker));
});

test('media plan rejects resources outside the saved plan allowlist', async (t) => {
  const result = await runPlanWithMocks(t, {
    MOCK_PLAN_RESOURCES: 'google_project_service.unrelated\n',
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /UNEXPECTED_MEDIA_PLAN_RESOURCES=google_project_service\.unrelated/);
  assert.match(result.stderr, /NO_APPROVED_TERRAFORM_PLAN/);
  assert.doesNotMatch(result.stdout, /READY: MEDIA_TERRAFORM_PLAN=/);
  await readFile(result.planMarker);
  await assert.rejects(readFile(result.publishedPlan));
});

test('media plan rejects destructive actions in the saved plan', async (t) => {
  const result = await runPlanWithMocks(t, {
    MOCK_PLAN_DELETES: 'google_storage_bucket.media\n',
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /DESTRUCTIVE_MEDIA_PLAN_CHANGES=google_storage_bucket\.media/);
  assert.match(result.stderr, /NO_APPROVED_TERRAFORM_PLAN/);
  assert.doesNotMatch(result.stdout, /READY: MEDIA_TERRAFORM_PLAN=/);
  await readFile(result.planMarker);
  await assert.rejects(readFile(result.publishedPlan));
});

test('media plan rejects a saved plan for a different runtime identity', async (t) => {
  const result = await runPlanWithMocks(t, {
    MOCK_PLANNED_RUNTIME_IDENTITY:
      'requested-media-bucket\tserviceAccount:wrong@khedmah-test-project.iam.gserviceaccount.com',
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /PLANNED_RUNTIME_MEDIA_IDENTITY_MISMATCH/);
  assert.match(result.stderr, /NO_APPROVED_TERRAFORM_PLAN/);
  assert.doesNotMatch(result.stdout, /READY: MEDIA_TERRAFORM_PLAN=/);
  await readFile(result.planMarker);
  await assert.rejects(readFile(result.publishedPlan));
});

test('Terraform state and saved plans cannot be committed', async () => {
  const ignore = await read('../.gitignore');
  assert.match(ignore, /\*\.tfstate/);
  assert.match(ignore, /\*\.tfplan/);
});
