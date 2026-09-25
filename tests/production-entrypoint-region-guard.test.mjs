import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(join(root, path), 'utf8');
const scripts = [
  'bootstrap-new-production-project.sh', 'configure-new-production-database-secret.sh',
  'google-production-deploy.sh', 'google-production-rollback.sh',
  'production-operator-preflight.sh', 'production-operator-live-validation.sh',
  'production-operator-health-check.sh', 'run-live-production-certification.sh',
  'collect-live-production-evidence.sh', 'validate-production-deployment-readiness.sh',
];
const marker = 'ERROR: GOOGLE_CLOUD_REGION must be europe-west1 for approved Production operations.';
const defaultedScripts = new Set([
  'bootstrap-new-production-project.sh', 'configure-new-production-database-secret.sh',
]);

function isolated(t) {
  const dir = mkdtempSync(join(tmpdir(), 'khedmah-precloud-region-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bin = join(dir, 'bin'); mkdirSync(bin);
  const calls = join(dir, 'calls'); writeFileSync(calls, '');
  for (const tool of ['gcloud', 'firebase', 'terraform', 'gh', 'npm', 'docker', 'curl', 'git', 'openssl']) {
    writeFileSync(join(bin, tool), '#!/bin/bash\nprintf "%s\\n" "${0##*/}" >> "$CALL_LOG"\nexit 87\n', { mode: 0o755 });
  }
  return { dir, calls, env: {
    PATH: `${bin}:${process.env.PATH}`, HOME: dir, CALL_LOG: calls,
    GOOGLE_CLOUD_PROJECT: 'khedma-dl', PRODUCTION_GOOGLE_CLOUD_PROJECT: 'khedma-dl',
    GOOGLE_CLOUD_REGION: 'europe-west1', GCS_MEDIA_LOCATION: 'europe-west1',
    TF_STATE_LOCATION: 'europe-west1',
  }};
}

for (const name of scripts) {
  test(`${name} rejects an unapproved runtime region before calling any external tool`, t => {
    const ctx = isolated(t);
    const source = read(`scripts/${name}`);
    const check = source.indexOf(marker);
    assert.ok(check >= 0, 'missing explicit pre-cloud region guard');
    const firstCloud = source.search(/(?:^|[\s"$(])gcloud\s+(?:auth|projects|config|run|builds|services|storage|iam|sql|secrets|artifacts)\b/m);
    assert.ok(firstCloud < 0 || check < firstCloud, 'region check follows a cloud command');
    for (const value of ['me-central1', 'us-central1', 'EUROPE-WEST1', 'europe-west1 ', 'test-do-not-log']) {
      const result = spawnSync('/bin/bash', [join(root, 'scripts', name)], {
        cwd: ctx.dir, encoding: 'utf8', env: { ...ctx.env, GOOGLE_CLOUD_REGION: value }, timeout: 5000,
      });
      assert.equal(result.status, 64, `${name}: ${result.stderr}`);
      assert.ok(result.stderr.includes(marker));
      assert.equal(readFileSync(ctx.calls, 'utf8'), '', 'guard contacted an external command');
      assert.equal(result.stderr, `${marker}\n`, 'diagnostic must be fixed text, not arbitrary input');
      assert.equal(result.stdout, '');
    }
  });
}


for (const name of scripts.filter(name => !defaultedScripts.has(name))) {
  test(`${name} rejects absent and empty runtime regions before external commands`, t => {
    const ctx = isolated(t);
    for (const missing of [false, true]) {
      const env = { ...ctx.env, GOOGLE_CLOUD_REGION: '' };
      if (missing) delete env.GOOGLE_CLOUD_REGION;
      const result = spawnSync('/bin/bash', [join(root, 'scripts', name)], {
        cwd: ctx.dir, encoding: 'utf8', env, timeout: 5000,
      });
      assert.equal(result.status, 64);
      assert.equal(result.stderr, `${marker}\n`);
      assert.equal(readFileSync(ctx.calls, 'utf8'), '');
    }
  });
}

test('bootstrap also rejects an independently overridden state-bucket region', t => {
  const ctx = isolated(t);
  const result = spawnSync('/bin/bash', [join(root, 'scripts/bootstrap-new-production-project.sh')], {
    cwd: ctx.dir, encoding: 'utf8', env: { ...ctx.env, TF_STATE_LOCATION: 'me-central1' }, timeout: 5000,
  });
  assert.equal(result.status, 64);
  assert.match(result.stderr, /TF_STATE_LOCATION must be europe-west1/);
  assert.equal(readFileSync(ctx.calls, 'utf8'), '');
});

for (const name of ['google-production-deploy.sh', 'validate-production-deployment-readiness.sh']) {
  test(`${name} rejects a mismatched media region before a cloud read`, t => {
    const ctx = isolated(t);
    const result = spawnSync('/bin/bash', [join(root, 'scripts', name)], {
      cwd: ctx.dir, encoding: 'utf8', env: { ...ctx.env, GCS_MEDIA_LOCATION: 'me-central1' }, timeout: 5000,
    });
    assert.equal(result.status, 64);
    assert.match(result.stderr, /GCS_MEDIA_LOCATION must be europe-west1/);
    assert.equal(readFileSync(ctx.calls, 'utf8'), '');
  });
}

// Existing workflows use stable two-space job / six-space step indentation.
// Discover every protected job rather than trusting a hand-written subset.
let protectedJobs = 0;
for (const file of readdirSync(join(root, '.github/workflows')).filter(f => f.endsWith('.yml'))) {
  const source = read(`.github/workflows/${file}`);
  const jobs = source.split(/^jobs:\s*$/m)[1];
  if (!jobs) continue;
  const sections = [...jobs.matchAll(/^  ([A-Za-z0-9_-]+):\s*\n([\s\S]*?)(?=^  [A-Za-z0-9_-]+:\s*$|(?![\s\S]))/gm)];
  for (const [, job, body] of sections) {
    if (!/^    environment: production\s*$/m.test(body) || !/uses: google-github-actions\/auth@/.test(body)) continue;
    protectedJobs += 1;
    test(`${file}/${job} rejects bad protected regions before Google authentication`, t => {
      const ctx = isolated(t);
      const guardStart = body.indexOf('      - name: Reject unapproved Production hosting region');
      assert.ok(guardStart >= 0, 'missing pre-auth guard');
      assert.ok(guardStart < body.indexOf('uses: google-github-actions/auth@'));
      const nextStep = body.indexOf('\n      - ', guardStart + 1);
      const guard = body.slice(guardStart, nextStep < 0 ? undefined : nextStep);
      assert.doesNotMatch(guard, /continue-on-error|\bif:|\|\|\s*true/);
      const variables = [...guard.matchAll(/^          ([A-Z_]+): \$\{\{ vars\.\1 \}\}\s*$/gm)].map(m => m[1]);
      const expectedVariables = file.startsWith('terraform-media-')
        ? ['GCS_MEDIA_LOCATION', 'TF_STATE_LOCATION']
        : file === 'production-operator-new-account.yml' || file === 'google-production-readiness.yml'
          ? ['GOOGLE_CLOUD_REGION', 'GCS_MEDIA_LOCATION']
          : ['GOOGLE_CLOUD_REGION'];
      assert.deepEqual(variables, expectedVariables, 'all required protected regions must be independently bound');
      assert.doesNotMatch(guard, /vars\.[A-Z_]+\s*\|\|/);
      const run = guard.split('        run: |\n')[1]?.split('\n').map(l => l.replace(/^          /, '')).join('\n');
      assert.ok(run);
      const execute = overrides => spawnSync('/bin/bash', ['-c', run], {
        cwd: ctx.dir, encoding: 'utf8', env: { ...ctx.env, ...overrides }, timeout: 5000,
      });
      assert.equal(execute({}).status, 0);
      for (const name of variables) {
        for (const value of ['', 'me-central1', 'us-central1', 'EUROPE-WEST1', 'europe-west1 ', 'unexpected-input']) {
          const result = execute({ [name]: value });
          assert.equal(result.status, 64, `${name}=${value}`);
          assert.ok(result.stderr.includes(`${name} must be europe-west1`));
        }
      }
      assert.equal(readFileSync(ctx.calls, 'utf8'), '');
    });
  }
}
test('all currently protected cloud-authentication jobs were discovered', () => {
  assert.equal(protectedJobs, 15);
});
