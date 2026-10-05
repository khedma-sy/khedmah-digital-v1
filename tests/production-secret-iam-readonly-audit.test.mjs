import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const script = path.join(root, 'scripts', 'audit-production-secret-iam-readonly.sh');

test('read-only secret IAM audit is pinned to 17 permanent secrets and excludes bootstrap secret', async () => {
  const source = await readFile(script, 'utf8');
  const block = source.match(/secret_names=\(([\s\S]*?)\)\n\ntest/);
  assert.ok(block);
  const names = [...block[1].matchAll(/^\s{2}([A-Z0-9_]+)$/gm)].map((m) => m[1]);
  assert.equal(names.length, 17);
  assert.ok(names.includes('DATABASE_URL'));
  assert.ok(names.includes('DATABASE_MIGRATION_URL'));
  assert.ok(!names.includes('BOOTSTRAP_ADMIN_SECRET'));
  assert.doesNotMatch(source, /secrets versions access/);
  assert.doesNotMatch(source, /secrets versions add/);
  assert.doesNotMatch(source, /add-iam-policy-binding|remove-iam-policy-binding|set-iam-policy/);
  assert.doesNotMatch(source, /terraform\s+(apply|import)|gcloud\s+run\s+(deploy|jobs execute)/);
});

test('read-only secret IAM audit collects metadata only with mocked gcloud', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'khedmah-secret-audit-'));
  const bin = path.join(dir, 'gcloud');
  const calls = path.join(dir, 'calls.log');
  const mock = `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >>"${CALLS_LOG}"
case "$*" in
  "projects describe khedma-dl --format=value(projectNumber)") echo 311026134906 ;;
  "projects get-ancestors khedma-dl --format=json") echo '[{"type":"project","id":"311026134906"}]' ;;
  secrets\\ describe*) name="$3"; echo "projects/khedma-dl/secrets/$name" ;;
  secrets\\ versions\\ describe*) echo ENABLED ;;
  secrets\\ get-iam-policy*) echo '{"bindings":[]}' ;;
  asset\\ analyze-iam-policy*) echo '{"fullyExplored":true,"mainAnalysis":{"fullyExplored":true,"analysisResults":[],"nonCriticalErrors":[]}}' ;;
  *) echo "unexpected: $*" >&2; exit 9 ;;
esac
`;
  await writeFile(bin, mock);
  await chmod(bin, 0o755);

  const run = spawnSync('bash', [script], {
    cwd: root,
    env: { ...process.env, PATH: dir + path.delimiter + process.env.PATH, HOME: dir, CALLS_LOG: calls, GOOGLE_CLOUD_PROJECT: 'khedma-dl' },
    encoding: 'utf8'
  });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /SECRET_COUNT=17/);
  assert.match(run.stdout, /SECRET_PAYLOADS_READ=0/);
  assert.match(run.stdout, /CLOUD_MUTATIONS=0/);

  const reportPath = run.stdout.match(/REPORT=(.+)/)?.[1]?.trim();
  assert.ok(reportPath);
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  assert.equal(report.length, 17);
  assert.ok(report.every((x) => x.latestState === 'ENABLED'));

  const commandLog = await readFile(calls, 'utf8');
  assert.doesNotMatch(commandLog, /versions access|versions add/);
  assert.doesNotMatch(commandLog, /add-iam-policy-binding|remove-iam-policy-binding|set-iam-policy/);
});
