import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const directory = 'scripts/deployment';
const runners = readdirSync(directory).filter(name => /^run-.*-nonproduction-migrations?\.sh$/.test(name));

test('replacement Preview entrypoints refuse apply before connecting or loading migration files', () => {
  assert.equal(runners.length, 10);
  const temp = mkdtempSync(join(tmpdir(), 'preview-schema-refusal-'));
  try {
    const marker = join(temp, 'connected');
    writeFileSync(join(temp, 'psql'), '#!/bin/sh\ntouch "' + marker + '"\nexit 99\n', { mode: 0o755 });
    for (const runner of runners) {
      const result = spawnSync('sh', [join(directory, runner)], { encoding: 'utf8', env: {
        ...process.env, PATH: temp + ':' + process.env.PATH,
        DEPLOYMENT_ENVIRONMENT: 'preview', GOOGLE_CLOUD_PROJECT: 'khedmah-preview-v2-20261012',
        PRODUCTION_GOOGLE_CLOUD_PROJECT: 'khedma-dl', MIGRATION_MODE: 'apply',
      } });
      assert.equal(result.status, 4, runner + ': ' + result.stderr);
      assert.match(result.stderr, /PREVIEW_V2_SCHEMA_VERIFY_ONLY/);
      assert.equal(existsSync(marker), false);
    }
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('final Preview verifier is reproducible from retained contracts and bundled with the matching checksum', () => {
  const result = spawnSync('python3', [join(directory, 'build-preview-schema-verification.py'), '--check'],
    { encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const sql = readFileSync(join(directory, 'preview-schema-verification.sql'));
  const digest = createHash('sha256').update(sql).digest('hex');
  assert.ok(readFileSync(join(directory, 'run-food-promotions-nonproduction-migration.sh'), 'utf8').includes(digest));
  assert.match(readFileSync('Dockerfile.food-promotions-migration', 'utf8'),
    /COPY scripts\/deployment\/preview-schema-verification.sql \/migrations\/preview-schema-verification.sql/);
  assert.match(sql.toString(), /BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY;/);
  assert.match(sql.toString(), /ROLLBACK;\nSELECT 'PREVIEW_V2_SCHEMA_AND_RUNTIME_ACL_READONLY_VERIFIED';/);
});
