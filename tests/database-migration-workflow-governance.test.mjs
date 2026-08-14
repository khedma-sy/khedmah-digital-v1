import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('database migration workflow governs the Migration 016 pair', async () => {
  const workflow = await read('.github/workflows/database-migration-check.yml');

  assert.match(workflow, /^\s+016_contact_submission_idempotency$/m);
  assert.match(workflow, /^\s+016_contact_submission_idempotency\.sql \\$/m);
  assert.match(workflow, /^\s+016_contact_submission_idempotency_rollback\.sql \\$/m);
});
