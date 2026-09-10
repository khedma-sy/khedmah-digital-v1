import { readFile } from 'node:fs/promises';
const requiredFiles = [
  '.github/workflows/preview-deployment.yml', '.github/workflows/staging-deployment.yml',
  'cloudbuild.preview.yaml', 'cloudbuild.preview-backend.yaml', 'cloudbuild.staging.yaml', 'cloudbuild.staging-backend.yaml', 'scripts/deployment/verify-cors-preflight.mjs',
  'scripts/deployment/deploy-cloud-run-environment.sh', 'scripts/deployment/ensure-classifieds-nonproduction-schema.sh',
  'scripts/deployment/run-classifieds-nonproduction-migration.sh', 'scripts/deployment/resolve-classifieds-preview-stage.sh', '.github/classifieds-preview-stage', 'Dockerfile.classifieds-migration', 'cloudbuild.classifieds-migration.yaml', 'scripts/deployment/cleanup-preview.sh',
  'scripts/deployment/rollback-staging.sh', 'scripts/validate-environment-separation.mjs',
  'docs/deployment/PREVIEW-STAGING-ARCHITECTURE.md', 'docs/deployment/OWNER-REVIEW-GUIDE.md'
];
const contents = await Promise.all(requiredFiles.map(file => readFile(file, 'utf8')));
const joined = contents.join('\n');
for (const required of ['pull_request:', "branches: [develop]", 'cleanup-preview.sh', 'upload-artifact@v4', 'actions/github-script@v7', 'npm audit', 'validate:firebase', 'validate:google', 'api/v1/health']) {
  if (!joined.includes(required)) throw new Error(`Preview/staging infrastructure is missing: ${required}`);
}
const preview = contents[0];
if (!preview.includes('github.event.pull_request.number') || !joined.includes('khedmah-pr-')) throw new Error('Preview resources must be scoped by PR number');
const deployment = await readFile('scripts/deployment/deploy-cloud-run-environment.sh', 'utf8');
if (!deployment.includes('Refusing to deploy to the production project')) throw new Error('Non-production deployment must reject the production project');
const previewBuild = await readFile('cloudbuild.preview.yaml', 'utf8');
if (previewBuild.includes('backend-774201339973.europe-west1.run.app')) throw new Error('Preview frontend must never target the production backend');
if (!deployment.includes('_NEXT_PUBLIC_API_URL=${backend_url}')) throw new Error('Preview frontend must be built against its isolated backend URL');
for (const required of ['PREVIEW_CLOUD_SQL_INSTANCE_CONNECTION_NAME', '--add-cloudsql-instances', 'DATABASE_URL=DATABASE_URL:latest', 'CLOUD_SQL_INSTANCE_CONNECTION_NAME=${CLOUD_SQL_INSTANCE_CONNECTION_NAME}', 'Preview Cloud SQL instance must belong to the preview project and region']) {
  if (!joined.includes(required)) throw new Error(`Preview database isolation is missing: ${required}`);
}

const previewStage = (await readFile('.github/classifieds-preview-stage', 'utf8')).trim();
if (!['off','apply-025','backend-on','frontend-on'].includes(previewStage)) throw new Error('Invalid tracked Classifieds Preview stage');
const previewStageResolver = await readFile('scripts/deployment/resolve-classifieds-preview-stage.sh', 'utf8');
for (const required of ['apply-025','backend-on','frontend-on','APPLY_KHEDMAH_NONPROD_025_PREVIEW']) {
  if (!previewStageResolver.includes(required)) throw new Error(`Classifieds Preview stage resolver is missing: ${required}`);
}
if (!preview.includes('steps.classifieds-stage.outputs.backend_enabled') || !preview.includes('steps.classifieds-stage.outputs.frontend_enabled') || !preview.includes('steps.classifieds-stage.outputs.migration_mode')) throw new Error('Preview workflow must derive Classifieds activation from the tracked stage resolver');

const staging = contents[1];
for (const required of ['postgres:16', 'ALLOW_DESTRUCTIVE_DB_TESTS', 'STAGING_CLOUD_SQL_INSTANCE_CONNECTION_NAME']) {
  if (!staging.includes(required)) throw new Error(`Staging readiness is missing: ${required}`);
}
const stagingBuild = await readFile('cloudbuild.staging.yaml', 'utf8');
if (!stagingBuild.includes('NEXT_PUBLIC_API_URL="${_NEXT_PUBLIC_API_URL}"')) throw new Error('Staging frontend must use the discovered isolated backend');
if (!deployment.includes('CORS_ORIGIN=${frontend_url}') || !deployment.includes('verify-cors-preflight.mjs')) throw new Error('Isolated credentialed origins must be configured and verified');


const previewDeployBlock = preview.slice(preview.indexOf('  deploy-preview:'), preview.indexOf('  review-evidence:'));
const previewCleanupBlock = preview.slice(preview.indexOf('  cleanup-preview:'));
for (const required of [
  'CLASSIFIEDS_ENABLED: ${{ steps.classifieds-stage.outputs.backend_enabled }}',
  'NEXT_PUBLIC_CLASSIFIEDS_ENABLED: ${{ steps.classifieds-stage.outputs.frontend_enabled }}',
  'CLASSIFIEDS_MIGRATION_025_MODE: ${{ steps.classifieds-stage.outputs.migration_mode }}',
  'CLASSIFIEDS_MIGRATION_025_CONFIRMATION: ${{ steps.classifieds-stage.outputs.migration_confirmation }}'
]) {
  if (!previewDeployBlock.includes(required)) throw new Error(`Preview deploy is missing stage-derived Classifieds rollout input: ${required}`);
  if (previewCleanupBlock.includes(required)) throw new Error(`Preview cleanup must not receive Classifieds rollout input: ${required}`);
}
for (const required of [
  "CLASSIFIEDS_ENABLED: ${{ vars.CLASSIFIEDS_ENABLED || 'false' }}",
  "NEXT_PUBLIC_CLASSIFIEDS_ENABLED: ${{ vars.NEXT_PUBLIC_CLASSIFIEDS_ENABLED || 'false' }}",
  "CLASSIFIEDS_MIGRATION_025_MODE: ${{ vars.CLASSIFIEDS_MIGRATION_025_MODE || 'off' }}",
  "CLASSIFIEDS_MIGRATION_025_CONFIRMATION: ${{ vars.CLASSIFIEDS_MIGRATION_025_CONFIRMATION || '' }}"
]) {
  if (!staging.includes(required)) throw new Error(`Staging deploy is missing Classifieds rollout input: ${required}`);
}

const frontendDocker = await readFile('Dockerfile.frontend', 'utf8');
for (const required of ['ARG NEXT_PUBLIC_CLASSIFIEDS_ENABLED=false', 'NEXT_PUBLIC_CLASSIFIEDS_ENABLED=$NEXT_PUBLIC_CLASSIFIEDS_ENABLED']) {
  if (!frontendDocker.includes(required)) throw new Error(`Classifieds frontend build flag is missing: ${required}`);
}
for (const buildFile of ['cloudbuild.preview.yaml', 'cloudbuild.staging.yaml']) {
  const build = await readFile(buildFile, 'utf8');
  if (!build.includes('NEXT_PUBLIC_CLASSIFIEDS_ENABLED="${_NEXT_PUBLIC_CLASSIFIEDS_ENABLED}"') || !build.includes('_NEXT_PUBLIC_CLASSIFIEDS_ENABLED: "false"')) {
    throw new Error(`${buildFile} must compile Classifieds from an explicit default-false build substitution`);
  }
}
for (const required of ['CLASSIFIEDS_ENABLED=${CLASSIFIEDS_ENABLED}', 'ensure-classifieds-nonproduction-schema.sh', '_NEXT_PUBLIC_CLASSIFIEDS_ENABLED=${NEXT_PUBLIC_CLASSIFIEDS_ENABLED}', 'Frontend Classifieds cannot be enabled before backend Classifieds', 'Backend Classifieds requires migration 025 verification before enablement']) {
  if (!deployment.includes(required)) throw new Error(`Classifieds deployment gate is missing: ${required}`);
}
const classifiedsMigration = await readFile('scripts/deployment/run-classifieds-nonproduction-migration.sh', 'utf8');
for (const required of ['025_classifieds', '0956abab007839d76e3aeca1d310835898e3b97bdc3adb784861f5fcd7c1cf5d', 'preview|staging', 'Refusing Classifieds migration 025 against the production project', 'MIGRATION_025_PARTIAL_OR_UNVERIFIED_STATE']) {
  if (!classifiedsMigration.includes(required)) throw new Error(`Classifieds migration safety gate is missing: ${required}`);
}
const productionOperator = await readFile('.github/workflows/production-operator.yml', 'utf8');
if (productionOperator.includes('APPLY_MIGRATION_025') || productionOperator.includes('025_classifieds')) throw new Error('Migration 025 must not be exposed through the Production operator');

console.log(`Preview/staging infrastructure valid (${requiredFiles.length} required files checked).`);
