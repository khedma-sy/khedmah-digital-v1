import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(new URL('../.github/workflows/production-domain-certification.yml', import.meta.url), 'utf8');

test('production domain certification is manual and locked to latest main', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /push:|pull_request:|schedule:/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /git fetch origin main/);
  assert.match(workflow, /git rev-parse origin\/main/);
  assert.match(workflow, /NEXT_PUBLIC_SITE_URL: \$\{\{ vars\.NEXT_PUBLIC_SITE_URL \}\}/);
  assert.match(workflow, /validate-production-domain-readiness\.sh/);
  assert.doesNotMatch(workflow, /id-token: write|gcloud run deploy|gcloud builds submit/);
});
