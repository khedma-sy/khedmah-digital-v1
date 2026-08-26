import assert from 'node:assert/strict';
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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
  const legacyStateList = join(sandbox, 'legacy-root-state-list.txt');
  await mkdir(bin);
  await writeFile(legacyStateList, overrides.MOCK_LEGACY_STATE_RESOURCES ?? '');
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  const mocks = {
    gcloud: `#!/usr/bin/env bash
set -eu
if [[ "$1 $2 $3" == "storage buckets describe" && "$4" == "gs://state-bucket" ]]; then
  printf '%s\\n' '{"iamConfiguration":{"uniformBucketLevelAccess":{"enabled":true},"publicAccessPrevention":"enforced"},"versioning":{"enabled":true}}'
elif [[ "$1 $2 $3" == "iam service-accounts describe" ]]; then
  printf '%s\\n' "$RUNTIME_SERVICE_ACCOUNT"
elif [[ "$1 $2 $3" == "storage buckets list" ]]; then
  [[ "$MOCK_BUCKET_LIST_STATUS" == "success" ]] || exit 9
  printf '%s' "$MOCK_EXISTING_BUCKETS"
else
  exit 1
fi
`,
    jq: `#!/usr/bin/env bash
set -eu
if [[ "\${1:-}" == "-er" ]]; then
  cat >/dev/null
  if [[ "$2" == *"google_storage_bucket.media"* ]]; then
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
case "$2" in
  init|validate) exit 0 ;;
  state)
    [[ "$3" == "list" ]]
    printf '%s' "$MOCK_STATE_RESOURCES"
    ;;
  show) printf '%s\\n' '{}' ;;
  plan) : > "$MOCK_PLAN_MARKER" ;;
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
      GOOGLE_CLOUD_REGION: 'europe-west1',
      TF_STATE_BUCKET: 'state-bucket',
      GCS_MEDIA_BUCKET: 'requested-media-bucket',
      RUNTIME_SERVICE_ACCOUNT: 'runtime@khedmah-test-project.iam.gserviceaccount.com',
      LEGACY_ROOT_STATE_LIST_FILE: legacyStateList,
      MOCK_STATE_RESOURCES: 'google_storage_bucket.media\n',
      MOCK_MEDIA_IDENTITY: 'requested-media-bucket\tkhedmah-test-project\teurope-west1',
      MOCK_RUNTIME_IDENTITY:
        'requested-media-bucket\tserviceAccount:runtime@khedmah-test-project.iam.gserviceaccount.com',
      MOCK_BUCKET_LIST_STATUS: 'success',
      MOCK_EXISTING_BUCKETS: '',
      MOCK_PLAN_MARKER: planMarker,
      ...overrides,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return { ...result, planMarker };
};

test('media infrastructure is isolated from the legacy root Terraform state', async () => {
  const root = await read('../infra/iac/main.tf');
  const media = await read('../infra/iac/media/main.tf');
  assert.doesNotMatch(root, /google_storage_bucket" "media/);
  assert.match(media, /google_storage_bucket" "media/);
});

test('media plan requires protected remote state and performs no apply', async () => {
  const script = await read('../scripts/plan-media-storage.sh');
  assert.match(script, /TF_STATE_BUCKET:\?TF_STATE_BUCKET is required/);
  assert.match(script, /publicAccessPrevention == "enforced"/);
  assert.match(script, /uniformBucketLevelAccess\.enabled == true/);
  assert.match(script, /versioning\.enabled == true/);
  assert.match(script, /terraform -chdir=infra\/iac\/media plan/);
  assert.match(script, /EXISTING_MEDIA_BUCKET_REQUIRES_REVIEWED_STATE_HANDOFF/);
  assert.match(script, /terraform -chdir=infra\/iac\/media show -json/);
  assert.match(script, /TRACKED_MEDIA_BUCKET_MISMATCH/);
  assert.match(script, /TRACKED_MEDIA_PROJECT_MISMATCH/);
  assert.match(script, /TRACKED_MEDIA_REGION_MISMATCH/);
  assert.match(script, /TRACKED_RUNTIME_MEMBER_MISMATCH/);
  assert.match(script, /MEDIA_BUCKET_EXISTENCE_CHECK_FAILED/);
  assert.match(script, /UNEXPECTED_TERRAFORM_STATE_PREFIX/);
  assert.match(script, /LEGACY_ROOT_MEDIA_STATE_HANDOFF_INCOMPLETE/);
  assert.match(script, /UNEXPECTED_MEDIA_STATE_RESOURCES/);
  assert.doesNotMatch(script, /terraform -chdir=infra\/iac\/media apply/);
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
  await readFile(result.planMarker);
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

test('media plan stops when state tracks a different region', async (t) => {
  const result = await runPlanWithMocks(t, {
    MOCK_MEDIA_IDENTITY: 'requested-media-bucket\tkhedmah-test-project\tUS',
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /TRACKED_MEDIA_REGION_MISMATCH/);
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
    MOCK_LEGACY_STATE_RESOURCES:
      'google_storage_bucket.media\ngoogle_storage_bucket_iam_member.runtime_media_objects\n',
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /LEGACY_ROOT_MEDIA_STATE_HANDOFF_INCOMPLETE/);
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

test('Terraform state and saved plans cannot be committed', async () => {
  const ignore = await read('../.gitignore');
  assert.match(ignore, /\*\.tfstate/);
  assert.match(ignore, /\*\.tfplan/);
});
