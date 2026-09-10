import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const deployment = readFileSync(new URL('../scripts/deployment/deploy-cloud-run-environment.sh', import.meta.url), 'utf8');

test('staging deployment blocks service rollout on the read-only release data integrity audit', () => {
  const buildIndex = deployment.indexOf('gcloud builds submit .');
  const auditIndex = deployment.indexOf('integrity_job="khedmah-release-data-integrity-staging"');
  const serviceDeployIndex = deployment.indexOf('backend_deploy_args=(');

  assert.ok(buildIndex >= 0, 'backend build must remain explicit');
  assert.ok(auditIndex > buildIndex, 'integrity audit must run from the image that will be deployed');
  assert.ok(serviceDeployIndex > auditIndex, 'integrity audit must finish before any Staging service deployment');

  const auditBlock = deployment.slice(
    deployment.lastIndexOf('if [[ "$environment" == "staging" ]]', auditIndex),
    deployment.indexOf('\nfi', auditIndex) + 3
  );
  assert.match(auditBlock, /--image "\$backend_image"/);
  assert.match(auditBlock, /--service-account "\$RUNTIME_SERVICE_ACCOUNT"/);
  assert.match(auditBlock, /--set-cloudsql-instances "\$CLOUD_SQL_INSTANCE_CONNECTION_NAME"/);
  assert.match(auditBlock, /--set-secrets="DATABASE_URL=DATABASE_URL:latest"/);
  assert.match(auditBlock, /CLOUD_SQL_INSTANCE_CONNECTION_NAME=\$\{CLOUD_SQL_INSTANCE_CONNECTION_NAME\}/);
  assert.match(auditBlock, /--command=node/);
  assert.match(auditBlock, /--args=apps\/backend\/dist\/database\/release-data-integrity\.cli\.js/);
  assert.match(auditBlock, /--max-retries=0/);
  assert.match(auditBlock, /gcloud run jobs execute "\$integrity_job"[\s\S]*--wait/);
});

test('release integrity job is Staging-only and deployment helper still refuses Production', () => {
  assert.match(deployment, /Only preview or staging deployment is allowed\./);
  assert.match(deployment, /Refusing to deploy to the production project\./);
  assert.equal((deployment.match(/khedmah-release-data-integrity-staging/g) ?? []).length, 1);
});
