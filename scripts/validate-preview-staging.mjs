import { readFile } from 'node:fs/promises';
const requiredFiles = [
  '.github/workflows/preview-deployment.yml', '.github/workflows/staging-deployment.yml',
  'cloudbuild.preview.yaml', 'cloudbuild.preview-backend.yaml', 'cloudbuild.staging.yaml',
  'scripts/deployment/deploy-cloud-run-environment.sh', 'scripts/deployment/cleanup-preview.sh',
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
console.log(`Preview/staging infrastructure valid (${requiredFiles.length} required files checked).`);
