import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const runner = read('scripts/deployment/run-classifieds-nonproduction-migration.sh');

test('Classifieds schema probe exposes stable read-only diagnostic exit codes', () => {
  const expected = new Map([
    ['missing_024', 41],
    ['not_applied', 42],
    ['partial_tables', 43],
    ['missing_indexes', 44],
    ['missing_triggers', 45],
    ['missing_functions', 46],
    ['missing_media', 47]
  ]);
  for (const [state, code] of expected) {
    assert.match(runner, new RegExp(`${state}\\) exit ${code}`));
  }
  assert.match(runner, /exit 48/);
  assert.match(runner, /exit 49/);
});

test('verify mode cannot enter the migration apply transaction', () => {
  const verifyGate = runner.indexOf("if [ \"$mode\" = 'verify' ]; then");
  const applyGate = runner.indexOf("[ \"$state\" = 'not_applied' ] || exit_for_schema_state");
  const transaction = runner.indexOf('BEGIN;');
  assert.ok(verifyGate > 0);
  assert.ok(applyGate > verifyGate);
  assert.ok(transaction > applyGate);
  assert.match(runner.slice(verifyGate, applyGate), /exit_for_schema_state \"\$state\"/);
});

test('production refusal precedes any schema query or mutation path', () => {
  const refusal = runner.indexOf('Refusing Classifieds migration 025 against the production project');
  const schemaProbe = runner.indexOf('schema_state()');
  const transaction = runner.indexOf('BEGIN;');
  assert.ok(refusal > 0);
  assert.ok(schemaProbe > refusal);
  assert.ok(transaction > schemaProbe);
});

test('schema state distinguishes unapplied and partial 025 footprints before apply', () => {
  for (const marker of ['missing_024','not_applied','partial_tables','missing_indexes','missing_triggers','missing_functions','missing_media','verified']) {
    assert.match(runner, new RegExp(marker));
  }
  assert.match(runner, /MIGRATION_025_PARTIAL_OR_UNVERIFIED_STATE/);
});
