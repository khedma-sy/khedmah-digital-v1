#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

const project = 'khedmah-preview-v2-20261012';
export const PREVIEW_V2_VARIABLES = Object.freeze({
  PREVIEW_GOOGLE_CLOUD_PROJECT: project,
  PREVIEW_FIREBASE_PROJECT_ID: project,
  GOOGLE_CLOUD_REGION: 'europe-west1',
  PREVIEW_ARTIFACT_REPOSITORY: 'khedmah-preview',
  PREVIEW_CLOUD_SQL_INSTANCE_CONNECTION_NAME: project + ':europe-west1:khedmah-preview-v2-db',
  PREVIEW_V2_WORKLOAD_IDENTITY_PROVIDER: 'projects/1044962071847/locations/global/workloadIdentityPools/khedmah-preview-github/providers/github-actions',
  PREVIEW_V2_DEPLOYER_SERVICE_ACCOUNT: 'khedmah-pv2-deployer@' + project + '.iam.gserviceaccount.com',
  PREVIEW_V2_RUNTIME_SERVICE_ACCOUNT: 'khedmah-pv2-runtime@' + project + '.iam.gserviceaccount.com',
});

// Runs before OIDC authentication. A partial environment update cannot authenticate.
// Identity identifiers are readable configuration; no secret payload is needed here.
export function verifyPreviewV2Configuration(env) {
  for (const [name, value] of Object.entries(PREVIEW_V2_VARIABLES)) {
    if (env[name] !== value) throw new Error('PREVIEW_V2_CONFIGURATION_MISMATCH_' + name);
  }
  if (env.PREVIEW_V2_CONFIGURATION_READY !== 'true'
      || env.PRODUCTION_GOOGLE_CLOUD_PROJECT !== 'khedma-dl'
      || env.PRODUCTION_FIREBASE_PROJECT_ID !== 'khedma-dl'
      || env.GITHUB_REPOSITORY !== 'khedma-sy/khedmah-digital-v1'
      || env.GITHUB_EVENT_NAME !== 'pull_request'
      || env.GITHUB_REF !== 'refs/pull/274/merge'
      || env.GITHUB_WORKFLOW_REF !== 'khedma-sy/khedmah-digital-v1/.github/workflows/preview-deployment.yml@refs/pull/274/merge') {
    throw new Error('PREVIEW_V2_CONFIGURATION_NOT_READY_OR_CONTEXT_REJECTED');
  }
  return { project, configuration_verified: true, deployment_held: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 2) throw new Error('PREVIEW_V2_CONFIGURATION_ARGUMENTS_REJECTED');
    console.log('PREVIEW_V2_CONFIGURATION=' + JSON.stringify(verifyPreviewV2Configuration(process.env)));
  } catch (error) {
    console.error('STOP: ' + error.message);
    process.exitCode = 1;
  }
}
