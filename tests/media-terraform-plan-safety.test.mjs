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
  assert.match(script, /EXISTING_MEDIA_BUCKET_REQUIRES_REVIEWED_IMPORT/);
  assert.match(script, /terraform -chdir=infra\/iac\/media show -json/);
  assert.match(script, /TRACKED_MEDIA_BUCKET_MISMATCH/);
  assert.match(script, /tracked_media_bucket.*MEDIA_BUCKET/s);
  assert.doesNotMatch(script, /terraform -chdir=infra\/iac\/media apply/);
});

test('isolated media stack pins its provider selections', async () => {
  const lock = await read('../infra/iac/media/.terraform.lock.hcl');
  assert.match(lock, /registry\.terraform\.io\/hashicorp\/google/);
  assert.match(lock, /version\s+=\s+"6\./);
});

test('media plan stops when state tracks a different bucket name', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'khedmah-media-plan-test-'));
  const bin = join(sandbox, 'bin');
  const planMarker = join(sandbox, 'plan-called');
  await mkdir(bin);
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  const mocks = {
    gcloud: `#!/usr/bin/env bash
set -eu
if [[ "$1 $2 $3" == "storage buckets describe" && "$4" == "gs://state-bucket" ]]; then
  printf '%s\\n' '{"iamConfiguration":{"uniformBucketLevelAccess":{"enabled":true},"publicAccessPrevention":"enforced"},"versioning":{"enabled":true}}'
elif [[ "$1 $2 $3" == "iam service-accounts describe" ]]; then
  printf '%s\\n' "$RUNTIME_SERVICE_ACCOUNT"
else
  exit 1
fi
`,
    jq: `#!/usr/bin/env bash
set -eu
if [[ "\${1:-}" == "-er" ]]; then
  cat >/dev/null
  printf '%s\\n' "$MOCK_TRACKED_BUCKET"
fi
`,
    terraform: `#!/usr/bin/env bash
set -eu
case "$2" in
  init|validate) exit 0 ;;
  state)
    [[ "$3" == "list" ]]
    printf '%s\\n' 'google_storage_bucket.media'
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
      MOCK_TRACKED_BUCKET: 'tracked-media-bucket',
      MOCK_PLAN_MARKER: planMarker,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /TRACKED_MEDIA_BUCKET_MISMATCH/);
  assert.match(result.stderr, /NO_TERRAFORM_PLAN_CREATED/);
  await assert.rejects(readFile(planMarker));
});

test('Terraform state and saved plans cannot be committed', async () => {
  const ignore = await read('../.gitignore');
  assert.match(ignore, /\*\.tfstate/);
  assert.match(ignore, /\*\.tfplan/);
});
