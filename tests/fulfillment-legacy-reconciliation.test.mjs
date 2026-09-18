import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const gitBlobSha = (text) => {
  const bytes = Buffer.from(text);
  return createHash('sha1')
    .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]))
    .digest('hex');
};

test('legacy PR165 mobility document schema is reconciled only from an exact fail-closed fingerprint', async () => {
  const runner = await read('scripts/deployment/run-fulfillment-nonproduction-migrations.sh');
  const reconciliation = await read('scripts/deployment/reconcile-legacy-165-mobility-documents.sql');
  const dockerfile = await read('Dockerfile.fulfillment-migration');

  assert.match(runner, /legacy_165_reconcilable/);
  assert.match(runner, /mobility_document_reviews_business_status_idx/);
  assert.match(runner, /mobility_document_review_events_business_created_idx/);
  assert.match(runner, /c\.confdeltype='n'/);
  assert.match(runner, /legacy_column_count/);
  assert.match(runner, /if \[ "\$mode" = 'verify' \]; then\s+exit_for_schema_state "\$state"\s+fi[\s\S]*if \[ "\$state" = 'legacy_165_reconcilable' \]/);
  assert.match(runner, /partial_or_unverified\) exit 44/);

  const approved = runner.match(/APPROVED_LEGACY_165_RECONCILE_BLOB='([0-9a-f]{40})'/)?.[1];
  assert.ok(approved);
  assert.equal(gitBlobSha(reconciliation), approved);

  assert.match(dockerfile, /COPY scripts\/deployment\/reconcile-legacy-165-mobility-documents\.sql \/migrations\/reconcile_legacy_165_mobility_documents\.sql/);

  assert.match(reconciliation, /^BEGIN;/m);
  assert.match(reconciliation, /pg_advisory_xact_lock\(hashtextextended\('khedmah-nonproduction-fulfillment-026-028'/);
  assert.match(reconciliation, /LEGACY_165_MOBILITY_DOCUMENT_FINGERPRINT_MISMATCH/);
  assert.match(reconciliation, /LEGACY_165_REVIEW_REASON_TOO_LONG/);
  assert.match(reconciliation, /LEGACY_165_EVENT_ACTOR_MISSING/);
  assert.match(reconciliation, /LEGACY_165_EVENT_MEDIA_MISSING/);
  assert.match(reconciliation, /LEGACY_165_EVENT_ACTOR_UNKNOWN/);
  assert.match(reconciliation, /LEGACY_165_REVIEW_MEDIA_MISMATCH/);
  assert.match(reconciliation, /DROP CONSTRAINT mobility_document_reviews_business_type_unique/);
  assert.match(reconciliation, /ADD CONSTRAINT mobility_document_review_events_media_asset_id_fkey/);
  assert.match(reconciliation, /ALTER COLUMN actor_user_id SET NOT NULL/);
  assert.match(reconciliation, /create_pending_mobility_document_review/);
  assert.match(reconciliation, /media_assets_pending_mobility_document_review/);
  assert.match(reconciliation, /ON CONFLICT \(media_asset_id\) DO NOTHING/);
  assert.match(reconciliation, /COMMIT;/);
  assert.doesNotMatch(reconciliation, /\b(?:DROP\s+TABLE|TRUNCATE|DELETE\s+FROM)\b/i);
});
