import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(new URL('../.github/workflows/production-bootstrap-admin.yml', import.meta.url), 'utf8');
const bootstrap = await readFile(new URL('../infra/iac/bootstrap/main.tf', import.meta.url), 'utf8');
const productionWif = await readFile(new URL('../infra/iac/production_operator.tf', import.meta.url), 'utf8');
const bootstrapScript = await readFile(new URL('../scripts/bootstrap-new-production-project.sh', import.meta.url), 'utf8');

test('production admin bootstrap is manual, latest-main locked and production protected', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /git fetch origin main/);
  assert.match(workflow, /git rev-parse origin\/main/);
  assert.match(workflow, /BOOTSTRAP_KHEDMAH_ADMIN_/);
  assert.doesNotMatch(workflow, /\npush:|\npull_request:|\nschedule:/);
});

test('bootstrap secret is bound temporarily, masked, removed and disabled only after account completion', () => {
  assert.match(workflow, /--update-secrets=BOOTSTRAP_ADMIN_SECRET=BOOTSTRAP_ADMIN_SECRET:latest/);
  assert.match(workflow, /gcloud secrets versions access latest/);
  assert.match(workflow, /::add-mask::\$bootstrap_secret/);
  assert.match(workflow, /--remove-secrets=BOOTSTRAP_ADMIN_SECRET/);
  assert.match(workflow, /gcloud secrets versions disable/);
  assert.match(workflow, /created_email_failed/);
  assert.match(workflow, /already_complete/);
  assert.doesNotMatch(workflow, /echo\s+["']?\$bootstrap_secret/);
  assert.doesNotMatch(workflow, /PRODUCTION_BOOTSTRAP_ADMIN_PASSWORD.*vars\./);
});

test('Terraform grants narrow access to the dedicated one-time secret only', () => {
  assert.match(bootstrap, /secret_id = "BOOTSTRAP_ADMIN_SECRET"/);
  assert.match(bootstrap, /bootstrap_admin_runtime/);
  assert.match(bootstrap, /bootstrap_admin_deployer/);
  assert.match(bootstrap, /roles\/secretmanager\.secretAccessor/);
  assert.match(bootstrap, /bootstrap_admin_version_manager/);
  assert.match(bootstrap, /roles\/secretmanager\.secretVersionManager/);
});

test('both initial and root production WIF boundaries explicitly allow the bootstrap workflow on main', () => {
  assert.match(productionWif, /production-bootstrap-admin\.yml@refs\/heads\/main/);
  assert.match(bootstrapScript, /production-bootstrap-admin\.yml/);
  assert.match(bootstrapScript, /github_ref=refs\/heads\/main/);
});
