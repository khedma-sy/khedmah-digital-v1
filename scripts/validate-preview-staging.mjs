import { readFile } from 'node:fs/promises';
const requiredFiles = [
  '.github/workflows/preview-deployment.yml', '.github/workflows/staging-deployment.yml',
  'cloudbuild.preview.yaml', 'cloudbuild.preview-backend.yaml', 'cloudbuild.staging.yaml', 'cloudbuild.staging-backend.yaml', 'scripts/deployment/verify-cors-preflight.mjs',
  'scripts/deployment/deploy-cloud-run-environment.sh', 'scripts/deployment/ensure-classifieds-nonproduction-schema.sh',
  'scripts/deployment/run-classifieds-nonproduction-migration.sh', 'scripts/deployment/resolve-classifieds-preview-stage.sh', '.github/classifieds-preview-stage',
  'scripts/deployment/resolve-classifieds-staging-stage.sh', '.github/classifieds-staging-stage', 'scripts/check-classifieds-preview-acceptance.mjs', 'Dockerfile.classifieds-migration', 'cloudbuild.classifieds-migration.yaml',
  'scripts/deployment/ensure-fulfillment-nonproduction-schema.sh', 'scripts/deployment/run-fulfillment-nonproduction-migrations.sh',
  'Dockerfile.fulfillment-migration', 'cloudbuild.fulfillment-migration.yaml',
  'scripts/deployment/ensure-taxi-pricing-nonproduction-schema.sh', 'scripts/deployment/run-taxi-pricing-nonproduction-migration.sh',
  'Dockerfile.taxi-pricing-migration', 'cloudbuild.taxi-pricing-migration.yaml',
  'scripts/deployment/ensure-billing-nonproduction-schema.sh', 'scripts/deployment/run-billing-nonproduction-migration.sh',
  'Dockerfile.billing-migration', 'cloudbuild.billing-migration.yaml',
  'scripts/deployment/ensure-food-promotions-nonproduction-schema.sh', 'scripts/deployment/run-food-promotions-nonproduction-migration.sh',
  'Dockerfile.food-promotions-migration', 'cloudbuild.food-promotions-migration.yaml',
  'scripts/deployment/cleanup-preview.sh', 'scripts/deployment/rollback-staging.sh', 'scripts/validate-environment-separation.mjs',
  'docs/deployment/PREVIEW-STAGING-ARCHITECTURE.md', 'docs/deployment/OWNER-REVIEW-GUIDE.md'
];
const contents = await Promise.all(requiredFiles.map(file => readFile(file, 'utf8')));
const joined = contents.join('\n');
for (const required of ['pull_request:', "branches: [develop]", 'cleanup-preview.sh', 'upload-artifact@v7', 'actions/github-script@v9', 'npm audit', 'validate:firebase', 'validate:google', 'api/v1/health']) {
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

const allowedStages = ['off','apply-025','verify-025','backend-on','frontend-on'];
const previewStage = (await readFile('.github/classifieds-preview-stage', 'utf8')).trim();
if (!allowedStages.includes(previewStage)) throw new Error('Invalid tracked Classifieds Preview stage');
const previewStageResolver = await readFile('scripts/deployment/resolve-classifieds-preview-stage.sh', 'utf8');
for (const required of ['apply-025','verify-025','backend-on','frontend-on','APPLY_KHEDMAH_NONPROD_025_PREVIEW']) {
  if (!previewStageResolver.includes(required)) throw new Error(`Classifieds Preview stage resolver is missing: ${required}`);
}
if (!preview.includes('steps.classifieds-stage.outputs.backend_enabled') || !preview.includes('steps.classifieds-stage.outputs.frontend_enabled') || !preview.includes('steps.classifieds-stage.outputs.migration_mode')) throw new Error('Preview workflow must derive Classifieds activation from the tracked stage resolver');

const staging = contents[1];
for (const required of ['postgres:16', 'ALLOW_DESTRUCTIVE_DB_TESTS', 'STAGING_CLOUD_SQL_INSTANCE_CONNECTION_NAME']) {
  if (!staging.includes(required)) throw new Error(`Staging readiness is missing: ${required}`);
}
const stagingStage = (await readFile('.github/classifieds-staging-stage', 'utf8')).trim();
if (!allowedStages.includes(stagingStage)) throw new Error('Invalid tracked Classifieds Staging stage');
const stagingStageResolver = await readFile('scripts/deployment/resolve-classifieds-staging-stage.sh', 'utf8');
for (const required of ['apply-025','verify-025','backend-on','frontend-on','APPLY_KHEDMAH_NONPROD_025_STAGING']) {
  if (!stagingStageResolver.includes(required)) throw new Error(`Classifieds Staging stage resolver is missing: ${required}`);
}
for (const required of [
  'CLASSIFIEDS_ENABLED: ${{ steps.classifieds-stage.outputs.backend_enabled }}',
  'NEXT_PUBLIC_CLASSIFIEDS_ENABLED: ${{ steps.classifieds-stage.outputs.frontend_enabled }}',
  'CLASSIFIEDS_MIGRATION_025_MODE: ${{ steps.classifieds-stage.outputs.migration_mode }}',
  'CLASSIFIEDS_MIGRATION_025_CONFIRMATION: ${{ steps.classifieds-stage.outputs.migration_confirmation }}'
]) {
  if (!staging.includes(required)) throw new Error(`Staging deploy is missing stage-derived Classifieds rollout input: ${required}`);
}
for (const forbidden of ['vars.CLASSIFIEDS_ENABLED','vars.NEXT_PUBLIC_CLASSIFIEDS_ENABLED','vars.CLASSIFIEDS_MIGRATION_025_MODE','vars.CLASSIFIEDS_MIGRATION_025_CONFIRMATION']) {
  if (staging.includes(forbidden)) throw new Error(`Staging Classifieds activation must not depend on mutable environment input: ${forbidden}`);
}
for (const required of ['classifieds-staging-acceptance:', "if: needs.deploy-staging.outputs.classifieds_frontend_enabled == 'true'", 'check-classifieds-preview-acceptance.mjs', 'EVIDENCE_DIR: staging-evidence']) {
  if (!staging.includes(required)) throw new Error(`Staging Classifieds browser acceptance is missing: ${required}`);
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
const frontendDocker = await readFile('Dockerfile.frontend', 'utf8');
for (const required of ['ARG NEXT_PUBLIC_CLASSIFIEDS_ENABLED=false', 'NEXT_PUBLIC_CLASSIFIEDS_ENABLED=$NEXT_PUBLIC_CLASSIFIEDS_ENABLED']) {
  if (!frontendDocker.includes(required)) throw new Error(`Classifieds frontend build flag is missing: ${required}`);
}
for (const buildFile of ['cloudbuild.preview.yaml', 'cloudbuild.staging.yaml']) {
  const build = await readFile(buildFile, 'utf8');
  if (!build.includes('NEXT_PUBLIC_CLASSIFIEDS_ENABLED="${_NEXT_PUBLIC_CLASSIFIEDS_ENABLED}"') || !build.includes('_NEXT_PUBLIC_CLASSIFIEDS_ENABLED: "false"')) throw new Error(`${buildFile} must compile Classifieds from an explicit default-false build substitution`);
}
for (const required of ['CLASSIFIEDS_ENABLED=${CLASSIFIEDS_ENABLED}', 'ensure-classifieds-nonproduction-schema.sh', '_NEXT_PUBLIC_CLASSIFIEDS_ENABLED=${NEXT_PUBLIC_CLASSIFIEDS_ENABLED}', 'Frontend Classifieds cannot be enabled before backend Classifieds', 'Backend Classifieds requires migration 025 verification before enablement']) {
  if (!deployment.includes(required)) throw new Error(`Classifieds deployment gate is missing: ${required}`);
}
const ensureClassifiedsSchema = await readFile('scripts/deployment/ensure-classifieds-nonproduction-schema.sh', 'utf8');
for (const required of ['CLASSIFIEDS_025_FAILED_EXECUTION', 'CLASSIFIEDS_025_CONTAINER_LOGS_BEGIN', 'gcloud run jobs executions describe', 'gcloud logging read']) if (!ensureClassifiedsSchema.includes(required)) throw new Error(`Classifieds migration diagnostics are missing: ${required}`);
const classifiedsMigration = await readFile('scripts/deployment/run-classifieds-nonproduction-migration.sh', 'utf8');
for (const required of ['025_classifieds', '0956abab007839d76e3aeca1d310835898e3b97bdc3adb784861f5fcd7c1cf5d', 'preview|staging', 'Refusing Classifieds migration 025 against the production project', 'MIGRATION_025_PARTIAL_OR_UNVERIFIED_STATE']) if (!classifiedsMigration.includes(required)) throw new Error(`Classifieds migration safety gate is missing: ${required}`);

for (const required of ['ensure-fulfillment-nonproduction-schema.sh','FULFILLMENT_MIGRATIONS_026_028_MODE','APPLY_KHEDMAH_NONPROD_026_028_${environment^^}','Migration 025 schema is required as the predecessor of fulfillment 026-028']) if (!deployment.includes(required)) throw new Error(`Fulfillment deployment gate is missing: ${required}`);
const ensureFulfillmentSchema = await readFile('scripts/deployment/ensure-fulfillment-nonproduction-schema.sh', 'utf8');
for (const required of ['Refusing fulfillment schema operation on the production project','FULFILLMENT_026_028_FAILED_EXECUTION','FULFILLMENT_026_028_CONTAINER_LOGS_BEGIN','gcloud run jobs executions describe','gcloud logging read','751262c11264815488136847e39e3dc162feab85','af18327bf03735f6ceaba5f5a60ab973822db355','a4dc42dac87226a3628d282d027164e33212c493']) if (!ensureFulfillmentSchema.includes(required)) throw new Error(`Fulfillment migration diagnostics or reviewed blobs are missing: ${required}`);
const fulfillmentMigration = await readFile('scripts/deployment/run-fulfillment-nonproduction-migrations.sh', 'utf8');
for (const required of ['026_cash_fulfillment_orders.sql','027_mobility_document_reviews.sql','028_platform_notifications.sql','Refusing fulfillment migrations 026-028 against the production project','FULFILLMENT_026_028_REQUIRES_MIGRATION_025','FULFILLMENT_026_028_PARTIAL_OR_UNVERIFIED_STATE',"pg_advisory_xact_lock(hashtextextended('khedmah-nonproduction-fulfillment-026-028', 0))",'ad_image','driver_photo']) if (!fulfillmentMigration.includes(required)) throw new Error(`Fulfillment migration safety gate is missing: ${required}`);

for (const required of ['ensure-taxi-pricing-nonproduction-schema.sh','TAXI_PRICING_MIGRATION_029_MODE','APPLY_KHEDMAH_NONPROD_029_${environment^^}']) if (!deployment.includes(required)) throw new Error(`Taxi pricing deployment gate is missing: ${required}`);
const taxiEnsure = await readFile('scripts/deployment/ensure-taxi-pricing-nonproduction-schema.sh','utf8');
for (const required of ['Refusing Taxi pricing schema operation on the production project','df9a7467f59f00e0167233901e6d7bb1e686994e8f97aec43696d53ac2d7870e','cloudbuild.taxi-pricing-migration.yaml']) if (!taxiEnsure.includes(required)) throw new Error(`Taxi pricing migration safety gate is missing: ${required}`);
const taxiRunner = await readFile('scripts/deployment/run-taxi-pricing-nonproduction-migration.sh','utf8');
for (const required of ['029_taxi_pricing_revisions','Refusing Taxi pricing migration 029 against the production project','partial_or_unverified',"pg_advisory_xact_lock(hashtextextended('khedmah-nonproduction-taxi-pricing-029',0))"]) if (!taxiRunner.includes(required)) throw new Error(`Taxi pricing migration runner is missing: ${required}`);

for (const required of ['ensure-billing-nonproduction-schema.sh','BILLING_MIGRATION_030_MODE','APPLY_KHEDMAH_NONPROD_030_${environment^^}']) if (!deployment.includes(required)) throw new Error(`Billing deployment gate is missing: ${required}`);
const billingEnsure = await readFile('scripts/deployment/ensure-billing-nonproduction-schema.sh','utf8');
for (const required of ['Refusing Billing schema operation on the production project','BILLING_030_033_FAILED_EXECUTION','BILLING_030_033_CONTAINER_LOGS_BEGIN','d758036cbcf20fbcee176c9ea7ba097564142de839b609b22a5cb469d6335194','88795ee75d9948e5ecf85d8c2d53f6b77397b52b','acc42c10459b0f90c276e843942bc712283616fc71ac854c177bb20defa34463','7bbdd79c5c129f41134c10ba15eedc644e396888','cloudbuild.billing-migration.yaml']) if (!billingEnsure.includes(required)) throw new Error(`Billing migration diagnostics or reviewed identity is missing: ${required}`);
const billingRunner = await readFile('scripts/deployment/run-billing-nonproduction-migration.sh','utf8');
for (const required of ['030_billing_credits_subscriptions','033_billing_admin_role','Refusing Billing migration 030 against the production project','MIGRATION_030_PARTIAL_OR_UNVERIFIED_STATE','MIGRATION_033_PARTIAL_OR_UNVERIFIED_STATE',"pg_advisory_xact_lock(hashtextextended('khedmah-nonproduction-billing-030',0))","pg_advisory_xact_lock(hashtextextended('khedmah-nonproduction-billing-033',0))",'pg_get_constraintdef(c.oid)',"d.definition LIKE '%billing_admin%'",'SYP_NEW_2026','KHEDMA30']) if (!billingRunner.includes(required)) throw new Error(`Billing migration safety gate is missing: ${required}`);

for (const required of ['ensure-food-promotions-nonproduction-schema.sh','FOOD_PROMOTIONS_MIGRATION_034_MODE','APPLY_KHEDMAH_NONPROD_034_${environment^^}']) if (!deployment.includes(required)) throw new Error(`Food promotion deployment gate is missing: ${required}`);
const foodPromotionEnsure = await readFile('scripts/deployment/ensure-food-promotions-nonproduction-schema.sh','utf8');
for (const required of ['Refusing food promotion schema operation on the production project','127206eb637c285b5fe8ed7bba389360562288e27cc3379d22596fb7dc2ac2dd','b59b8ae42b86bc505d9f2293579546a344e37ab1','FOOD_PROMOTIONS_034_FAILED_EXECUTION','FOOD_PROMOTIONS_034_CONTAINER_LOGS_BEGIN','cloudbuild.food-promotions-migration.yaml']) if (!foodPromotionEnsure.includes(required)) throw new Error(`Food promotion migration diagnostics or reviewed identity is missing: ${required}`);
const foodPromotionRunner = await readFile('scripts/deployment/run-food-promotions-nonproduction-migration.sh','utf8');
for (const required of ['034_food_order_promotions.sql','Refusing food promotion migration 034 against the production project','MIGRATION_034_REQUIRES_FULFILLMENT_026','MIGRATION_034_PARTIAL_OR_UNVERIFIED_STATE',"pg_advisory_xact_lock(hashtextextended('khedmah-nonproduction-food-promotions-034',0))",'food_promo_claims','discount_amount']) if (!foodPromotionRunner.includes(required)) throw new Error(`Food promotion migration safety gate is missing: ${required}`);

const productionOperator = await readFile('.github/workflows/production-operator.yml', 'utf8');
if (productionOperator.includes('APPLY_MIGRATION_025') || productionOperator.includes('025_classifieds')) throw new Error('Migration 025 must not be exposed through the Production operator');
for (const forbidden of ['026_cash_fulfillment_orders','027_mobility_document_reviews','028_platform_notifications','APPLY_MIGRATION_026','APPLY_MIGRATION_027','APPLY_MIGRATION_028','029_taxi_pricing_revisions','030_billing_credits_subscriptions','033_billing_admin_role','034_food_order_promotions','APPLY_MIGRATION_029','APPLY_MIGRATION_030','APPLY_MIGRATION_033','APPLY_MIGRATION_034','billing-migration','taxi-pricing-migration','food-promotions-migration']) if (productionOperator.includes(forbidden)) throw new Error(`Non-production migration must not be exposed through the Production operator: ${forbidden}`);

console.log(`Preview/staging infrastructure valid (${requiredFiles.length} required files checked).`);
