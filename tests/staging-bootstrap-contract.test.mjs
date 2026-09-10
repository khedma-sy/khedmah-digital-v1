import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const bootstrap = readFileSync('infra/iac/bootstrap/main.tf', 'utf8');
const productionWif = readFileSync('infra/iac/production_operator.tf', 'utf8');
const vars = readFileSync('infra/iac/bootstrap/staging.tfvars.example', 'utf8');
const ci = readFileSync('.github/workflows/node.js.yml', 'utf8');

function expectValue(name, value) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(vars, new RegExp(`${name}\\s*=\\s*"${escaped}"`));
}

test('staging bootstrap example is locked to the isolated staging workflow trust boundary', () => {
  expectValue('github_repository', 'khedma-sy/khedmah-digital-v1');
  expectValue('github_workflow_path', '.github/workflows/staging-deployment.yml');
  expectValue('github_ref', 'refs/heads/develop');
  expectValue('artifact_registry_repository_id', 'khedmah-staging');
  expectValue('runtime_service_account_id', 'khedmah-v1-staging-runtime');
  expectValue('deployer_service_account_id', 'khedmah-v1-staging-deployer');
  assert.match(vars, /REPLACE_WITH_ISOLATED_STAGING_PROJECT_ID/);
  assert.doesNotMatch(vars, /khedmah-preview-774201339973/);
  assert.doesNotMatch(vars, /production-operator\.yml/);
  assert.doesNotMatch(vars, /refs\/heads\/main/);
});

test('bootstrap provider enforces the same workflow_ref claim family used by the production WIF contract', () => {
  for (const claim of [
    'assertion.repository == "${var.github_repository}"',
    'assertion.ref == "${var.github_ref}"',
    'assertion.workflow_ref == "${var.github_repository}/${var.github_workflow_path}@${var.github_ref}"'
  ]) assert.ok(bootstrap.includes(claim), `missing WIF claim boundary: ${claim}`);
  assert.match(bootstrap, /"attribute\.workflow_ref"\s*=\s*"assertion\.workflow_ref"/);
  assert.doesNotMatch(bootstrap, /job_workflow_ref/);
  assert.match(productionWif, /assertion\.workflow_ref/);
  assert.match(bootstrap, /roles\/iam\.workloadIdentityUser/);
  assert.match(bootstrap, /google_service_account\.deployer\.name/);
});

test('CI validates the bootstrap Terraform stack without applying it', () => {
  assert.match(ci, /terraform -chdir=infra\/iac\/bootstrap init -backend=false -input=false/);
  assert.match(ci, /terraform -chdir=infra\/iac\/bootstrap validate/);
  assert.doesNotMatch(ci, /terraform -chdir=infra\/iac\/bootstrap apply/);
});
