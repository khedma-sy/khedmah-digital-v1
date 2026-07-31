import { readFile } from 'node:fs/promises';
const requiredFiles = ['.github/workflows/production-operator.yml'];
const sources = Object.fromEntries(await Promise.all(requiredFiles.map(async file => [file, await readFile(file, 'utf8')])));
const workflow = sources['.github/workflows/production-operator.yml'];

for (const contract of [
  'name: Production Operator', 'workflow_dispatch:', 'environment: production',
  'contents: read', 'id-token: write', 'google-github-actions/auth@v2',
  'workload_identity_provider: ${{ secrets.GCP_PRODUCTION_WORKLOAD_IDENTITY_PROVIDER }}',
  'service_account: ${{ secrets.OPERATIONS_DEPLOYER_SERVICE_ACCOUNT }}',
  'gcloud auth list', 'gcloud config list project',
  'gcloud projects describe "${{ vars.GOOGLE_CLOUD_PROJECT }}"'
]) {
  if (!workflow.includes(contract)) throw new Error(`Production operator workflow missing contract: ${contract}`);
}
for (const forbidden of [
  'gcloud run deploy', 'gcloud builds submit', 'firebase deploy',
  'google-production-deploy.sh', 'google-production-rollback.sh', 'terraform apply'
]) {
  if (workflow.includes(forbidden)) throw new Error(`Authentication-only workflow contains forbidden operation: ${forbidden}`);
}
console.log(`Production operator contract valid (${requiredFiles.length} files checked).`);
