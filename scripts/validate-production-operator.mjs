import { readFile } from 'node:fs/promises';

const workflow = await readFile('.github/workflows/production-operator.yml', 'utf8');
const cloudBuild = await readFile('cloudbuild.production.yaml', 'utf8');
const healthCheck = await readFile('scripts/production-operator-health-check.sh', 'utf8');

for (const contract of [
  'name: Production Operator',
  'workflow_dispatch:',
  'default: VERIFY_ONLY',
  '- DEPLOY_PRODUCTION',
  "if: ${{ inputs.mode == 'DEPLOY_PRODUCTION' }}",
  'environment: production',
  'contents: read',
  'id-token: write',
  'google-github-actions/auth@v3',
  'google-github-actions/setup-gcloud@v3',
  'workload_identity_provider: ${{ secrets.GCP_PRODUCTION_WORKLOAD_IDENTITY_PROVIDER }}',
  'service_account: ${{ secrets.OPERATIONS_DEPLOYER_SERVICE_ACCOUNT }}',
  '[[ "$REQUESTED_SHA" =~ ^[0-9a-f]{40}$ ]]',
  'test "$REQUESTED_SHA" = "$MAIN_SHA"',
  'gcloud builds get-default-service-account',
  'BUILD_SERVICE_ACCOUNT="projects/${GOOGLE_CLOUD_PROJECT}/serviceAccounts/${BUILD_SERVICE_ACCOUNT}"',
  'gcloud builds submit .',
  '--gcs-source-staging-dir "$SOURCE_STAGING_DIR"',
  '--config cloudbuild.production.yaml',
  'OPERATIONS_RUNTIME_SERVICE_ACCOUNT: ${{ vars.OPERATIONS_RUNTIME_SERVICE_ACCOUNT }}',
  'GCS_MEDIA_BUCKET: ${{ vars.GCS_MEDIA_BUCKET }}',
  'GOOGLE_MAPS_BROWSER_API_KEY: ${{ secrets.GOOGLE_MAPS_BROWSER_API_KEY }}',
  "FACEBOOK_AUTH_ENABLED: ${{ vars.FACEBOOK_AUTH_ENABLED || 'false' }}",
  'test -n "$OPERATIONS_RUNTIME_SERVICE_ACCOUNT"',
  'test -n "$GCS_MEDIA_BUCKET"',
  'bash scripts/validate-production-deployment-readiness.sh',
  'bash scripts/validate-firebase-social-auth-readiness.sh',
  '--substitutions "COMMIT_SHA=$REQUESTED_SHA,_REGION=$GOOGLE_CLOUD_REGION,_AR_REPOSITORY=$OPERATIONS_ARTIFACT_REPOSITORY,_BACKEND_SERVICE=$BACKEND_SERVICE,_FRONTEND_SERVICE=$FRONTEND_SERVICE,_RUNTIME_SERVICE_ACCOUNT=$OPERATIONS_RUNTIME_SERVICE_ACCOUNT,_CLOUD_SQL_INSTANCE=$CLOUD_SQL_INSTANCE_CONNECTION_NAME,_GCS_MEDIA_BUCKET=$GCS_MEDIA_BUCKET,_FACEBOOK_AUTH_ENABLED=$FACEBOOK_AUTH_ENABLED"',
  'test "${STATUS:-}" = SUCCESS',
  'curl --fail --silent --show-error',
  '--virtual-time-budget=25000',
  `grep -Eq '<main[^>]+data-map-status="ready"' "$MAP_DOM"`,
  'access-control-allow-origin: $FRONTEND_URL',
  'PRODUCTION_VALIDATION=SUCCESS',
  "printf -- '- Commit: `%s`"
]) {
  if (!workflow.includes(contract)) throw new Error(`Production operator workflow missing contract: ${contract}`);
}

for (const forbidden of ['push:', 'schedule:', 'pull_request:', 'terraform apply', '--force', 'secrets versions access']) {
  if (workflow.includes(forbidden)) throw new Error(`Production operator contains forbidden trigger or operation: ${forbidden}`);
}

for (const contract of [
  'name: node:24',
  'node:24',
  'id: verify-runtime-readiness',
  '/api/v1/health',
  '/api/v1/health/ready',
  'Production runtime liveness and readiness verified.'
]) {
  if (!cloudBuild.includes(contract)) throw new Error(`Production Cloud Build missing runtime contract: ${contract}`);
}
if (/\bnode:20\b/.test(cloudBuild)) throw new Error('Production Cloud Build must not use Node 20 after the Node 24 runtime migration.');

for (const contract of ['/api/v1/health', '/api/v1/health/ready', 'ready:true']) {
  if (!healthCheck.includes(contract)) throw new Error(`Production health evidence script missing readiness contract: ${contract}`);
}

console.log('Production operator gated deployment, Node 24, and database readiness contracts valid.');
