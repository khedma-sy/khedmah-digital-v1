import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const rollback = readFileSync(new URL('../scripts/deployment/rollback-staging.sh', import.meta.url), 'utf8');

test('Staging rollback validates both target revisions before moving traffic', () => {
  assert.match(rollback, /backend_service='khedmah-backend-staging'/);
  assert.match(rollback, /frontend_service='khedmah-frontend-staging'/);
  assert.match(rollback, /Refusing rollback in production\./);
  assert.match(rollback, /Backend revision does not belong to the Staging backend service\./);
  assert.match(rollback, /Frontend revision does not belong to the Staging frontend service\./);

  const validateBackend = rollback.indexOf('revision_exists_for_service "$backend_service" "$backend_revision"');
  const validateFrontend = rollback.indexOf('revision_exists_for_service "$frontend_service" "$frontend_revision"');
  const firstTrafficMove = rollback.indexOf('gcloud run services update-traffic "$backend_service"', rollback.indexOf('trap compensate_partial_rollback ERR'));
  assert.ok(validateBackend >= 0 && validateFrontend > validateBackend);
  assert.ok(firstTrafficMove > validateFrontend, 'both target revisions must be proven before the first traffic mutation');
  assert.match(rollback, /gcloud run revisions list[\s\S]*--service "\$service"[\s\S]*--filter="metadata\.name=\$\{revision\}"/);
});

test('Staging rollback refuses ambiguous existing traffic and compensates partial changes', () => {
  assert.match(rollback, /traffic\.length !== 1 \|\| Number\(traffic\[0\]\.percent\) !== 100/);
  assert.match(rollback, /previous_backend_revision="\$\(single_serving_revision "\$backend_service"\)"/);
  assert.match(rollback, /previous_frontend_revision="\$\(single_serving_revision "\$frontend_service"\)"/);
  assert.match(rollback, /trap compensate_partial_rollback ERR/);
  assert.match(rollback, /--to-revisions "\$previous_frontend_revision=100"/);
  assert.match(rollback, /--to-revisions "\$previous_backend_revision=100"/);
});

test('Staging rollback verifies final traffic and live health without changing database state', () => {
  assert.match(rollback, /actual_backend_revision="\$\(single_serving_revision "\$backend_service"\)"/);
  assert.match(rollback, /actual_frontend_revision="\$\(single_serving_revision "\$frontend_service"\)"/);
  assert.match(rollback, /Backend traffic did not converge to the requested rollback revision\./);
  assert.match(rollback, /Frontend traffic did not converge to the requested rollback revision\./);
  assert.match(rollback, /\$\{backend_url\}\/api\/v1\/health/);
  assert.match(rollback, /\$\{frontend_url\}\//);
  assert.match(rollback, /Database state was not rolled back/);
  assert.doesNotMatch(rollback, /\b(?:psql|DELETE|UPDATE\s+schema_migrations|DROP\s+TABLE|DROP\s+SCHEMA)\b/i);
});
