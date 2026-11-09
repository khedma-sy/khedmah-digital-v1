import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('../scripts/diagnostics/provider-visibility-readonly.sql', import.meta.url), 'utf8');
const executable = sql.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');

test('provider visibility inspector enforces read-only repeatable-read transaction and fails closed', () => {
  assert.match(executable, /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY;/);
  assert.match(executable, /current_database\(\)\s*<>\s*'khedmah'/);
  assert.match(executable, /current_setting\('transaction_read_only'\)\s*<>\s*'on'/);
  assert.match(executable, /SET LOCAL statement_timeout = '10s'/);
  assert.match(executable, /SET LOCAL lock_timeout = '1s'/);
  assert.match(executable, /SET LOCAL search_path = pg_catalog;/);
  assert.match(executable, /ROLLBACK;\s*$/);
  assert.doesNotMatch(executable, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|DROP|GRANT|REVOKE|COPY|EXECUTE|CALL|LOCK)\b/i);
});

test('inspector returns aggregate counters only and matches both public search eligibility gates', () => {
  assert.match(executable, /FROM public\.business_profiles/);
  assert.match(executable, /FROM public\.professional_profiles/);
  assert.match(executable, /COUNT\(\*\) FILTER \(WHERE visibility = 'public' AND moderation_status = 'approved'\s+AND trust_status = 'approved' AND status = 'active'/);
  assert.match(executable, /COUNT\(\*\) FILTER \(WHERE visibility = 'public' AND moderation_status = 'approved'\s+AND lifecycle_status = 'active'\) AS public_search_eligible/);
  assert.match(executable, /LOWER\(BTRIM\(name\)\) NOT IN/);
  assert.match(executable, /eligible_without_valid_map_point/);
  assert.match(executable, /not_submitted/);
  assert.doesNotMatch(executable, /\b(?:user_identifier|owner_user_id|email|phone|address|latitude|longitude|city_code|headline_ar|bio_ar)\b/i);
  assert.doesNotMatch(executable, /SELECT\s+\*/i);
});

test('inspector explicitly prohibits publishing raw profile or precise map values', () => {
  assert.match(executable, /SELECT 'business'::text AS profile_type/);
  assert.match(executable, /UNION ALL\s+SELECT 'professional'::text/);
  assert.doesNotMatch(executable, /\b(?:b|p)\.(?:id|name|lat|lng|city_code|owner_user_id|user_identifier)\b/i);
});
