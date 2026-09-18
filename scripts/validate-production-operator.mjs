import { readFile } from 'node:fs/promises';

const workflow = await readFile('.github/workflows/production-operator-new-account.yml', 'utf8');
const cloudBuild = await readFile('cloudbuild.production-new-account.yaml', 'utf8');
const healthCheck = await readFile('scripts/production-operator-health-check.sh', 'utf8');

for (const contract of [
  'name: Production Operator - New Account',
  'workflow_dispatch:',
  'default: VERIFY_ONLY',
  'DEPLOY_PRODUCTION',
  "if: ${{ inputs.mode == 'DEPLOY_PRODUCTION' }}",
  'environment: production',
  'contents: read',
  'id-token: write',
  'google-github-actions/auth@v3',
  'google-github-actions/setup-gcloud@v3',
  'workload_identity_provider: ${{ secrets.GCP_PRODUCTION_WORKLOAD_IDENTITY_PROVIDER }}',
  'service_account: ${{ secrets.OPERATIONS_DEPLOYER_SERVICE_ACCOUNT }}',
  'git fetch origin main',
  'test "$(git rev-parse origin/main)" = "$REQUESTED_SHA"',
  'OPERATIONS_BUILD_SERVICE_ACCOUNT: ${{ vars.OPERATIONS_BUILD_SERVICE_ACCOUNT }}',
  'BUILD_SERVICE_ACCOUNT="projects/${GOOGLE_CLOUD_PROJECT}/serviceAccounts/${OPERATIONS_BUILD_SERVICE_ACCOUNT}"',
  'cloudbuild.production-new-account.yaml',
  'OPERATIONS_RUNTIME_SERVICE_ACCOUNT: ${{ vars.OPERATIONS_RUNTIME_SERVICE_ACCOUNT }}',
  'GCS_MEDIA_BUCKET: ${{ vars.GCS_MEDIA_BUCKET }}',
  'CORS_ORIGIN: ${{ vars.CORS_ORIGIN }}',
  'NEXT_PUBLIC_SITE_URL: ${{ vars.NEXT_PUBLIC_SITE_URL }}',
  'npm run validate:identity:production',
  'bash scripts/validate-production-deployment-readiness.sh',
  '/api/v1/health',
  '/api/v1/health/ready',
  '--virtual-time-budget=25000',
  'data-map-status=\"ready\"',
  'MAP_STATUS=ready'
]) {
  if (!workflow.includes(contract)) throw new Error(`Production operator workflow missing contract: ${contract}`);
}

for (const forbidden of ['push:', 'schedule:', 'pull_request:', 'terraform apply', 'secrets versions access']) {
  if (workflow.includes(forbidden)) throw new Error(`Production operator contains forbidden trigger or operation: ${forbidden}`);
}

for (const contract of [
  'name: node:24',
  'id: verify-runtime-readiness',
  '/api/v1/health',
  '/api/v1/health/ready',
  '_RUNTIME_SERVICE_ACCOUNT: REQUIRED_RUNTIME_SERVICE_ACCOUNT',
  '_CLOUD_SQL_INSTANCE: REQUIRED_CLOUD_SQL_INSTANCE',
  '_GCS_MEDIA_BUCKET: REQUIRED_GCS_MEDIA_BUCKET',
  '_SITE_URL: REQUIRED_SITE_URL',
  'NEXT_PUBLIC_SITE_URL=${_SITE_URL}',
  'id: resolve-or-bootstrap-backend-url',
  'production-backend-url',
  '--build-arg NEXT_PUBLIC_API_URL="$BACKEND_URL"',
  'id: bind-live-frontend-origin',
  'CORS_ORIGIN=$ALLOWED_ORIGINS'
]) {
  if (!cloudBuild.includes(contract)) throw new Error(`Production Cloud Build missing runtime contract: ${contract}`);
}
if (/\bnode:20\b/.test(cloudBuild)) throw new Error('Production Cloud Build must not use Node 20.');
if (cloudBuild.includes('_NEXT_PUBLIC_API_URL')) throw new Error('Production Cloud Build must derive NEXT_PUBLIC_API_URL from the live backend service.');
if (workflow.includes('validate:firebase:production')) throw new Error('Web/backend Production deployment must not depend on Android Firebase release configuration.');
if (workflow.includes('gcloud builds get-default-service-account')) throw new Error('Production deployment must use the dedicated build service account, never the project default Cloud Build identity.');

for (const contract of ['/api/v1/health', '/api/v1/health/ready', 'ready:true']) {
  if (!healthCheck.includes(contract)) throw new Error(`Production health evidence script missing readiness contract: ${contract}`);
}

console.log('Production operator gated deployment contract valid; new-account, Node 24, Maps and database readiness contracts valid.');
