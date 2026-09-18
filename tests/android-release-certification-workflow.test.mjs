import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(new URL('../.github/workflows/android-release-certification.yml', import.meta.url), 'utf8');
const wif = await readFile(new URL('../infra/iac/production_operator.tf', import.meta.url), 'utf8');

test('Android release is exact-main, production protected and uses WIF', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /git rev-parse origin\/main/);
  assert.match(workflow, /google-github-actions\/auth@v3/);
  assert.match(workflow, /GCP_PRODUCTION_WORKLOAD_IDENTITY_PROVIDER/);
  assert.match(wif, /android-release-certification\.yml@refs\/heads\/main/);
  assert.doesNotMatch(workflow, /pull_request:|push:|schedule:/);
});

test('Android release derives the live Production backend URL instead of trusting a configured API URL', () => {
  assert.match(workflow, /gcloud projects describe/);
  assert.match(workflow, /DNS_SEGMENT/);
  assert.match(workflow, /\.run\.app/);
  assert.match(workflow, /gcloud run services describe/);
  assert.match(workflow, /\/api\/v1\/health\/ready/);
  assert.doesNotMatch(workflow, /vars\.NEXT_PUBLIC_API_URL/);
});

test('Android Maps and OAuth client values come only from scoped Secret Manager reads', () => {
  assert.match(workflow, /secrets versions access latest[\s\S]*GOOGLE_MAPS_ANDROID_API_KEY/);
  assert.match(workflow, /secrets versions access latest[\s\S]*GOOGLE_OAUTH_SERVER_CLIENT_ID/);
  assert.match(workflow, /::add-mask::\$MAPS_KEY/);
  assert.match(workflow, /::add-mask::\$OAUTH_SERVER_CLIENT_ID/);
  assert.doesNotMatch(workflow, /secrets\.GOOGLE_MAPS_ANDROID_API_KEY/);
  assert.doesNotMatch(workflow, /secrets\.GOOGLE_OAUTH_SERVER_CLIENT_ID/);
  assert.match(workflow, /npm run build:android:release-apk/);
  assert.match(workflow, /npm run build:android:release-aab/);
});
