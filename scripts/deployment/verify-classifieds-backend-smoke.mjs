import { pathToFileURL } from 'node:url';

const forbiddenPublicFields = ['ownerUserId', 'rejectionReason', 'revision', 'contentRevision', 'reviewRevision'];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(fetchImpl, baseUrl, path, expectedStatus) {
  const response = await fetchImpl(new URL(path, `${baseUrl.replace(/\/$/, '')}/`), {
    method: 'GET',
    headers: { accept: 'application/json' },
    redirect: 'manual'
  });
  assert(response.status === expectedStatus, `${path} expected HTTP ${expectedStatus}, received ${response.status}.`);
  return response;
}

export async function verifyClassifiedsBackendSmoke(baseUrl, fetchImpl = fetch) {
  assert(typeof baseUrl === 'string' && /^https:\/\/[^/]+\.run\.app\/?$/.test(baseUrl), 'Classifieds smoke requires an HTTPS Cloud Run backend URL.');

  const publicList = await request(fetchImpl, baseUrl, '/api/v1/classifieds', 200);
  const listBody = await publicList.json();
  assert(listBody && typeof listBody === 'object' && Array.isArray(listBody.ads), 'Public Classifieds list must return an ads array.');
  for (const ad of listBody.ads) {
    assert(ad && typeof ad === 'object' && !Array.isArray(ad), 'Public Classifieds entries must be objects.');
    for (const field of forbiddenPublicFields) {
      assert(!(field in ad), `Public Classifieds response leaked internal field: ${field}.`);
    }
  }

  await request(fetchImpl, baseUrl, '/api/v1/classifieds/smoke-nonexistent-classified-ad', 404);
  await request(fetchImpl, baseUrl, '/api/v1/classifieds/mine', 401);
  await request(fetchImpl, baseUrl, '/api/v1/admin/classifieds/pending', 401);

  process.stdout.write('Classifieds backend smoke passed: public list/detail and unauthenticated owner/admin boundaries verified.\n');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  verifyClassifiedsBackendSmoke(process.argv[2]).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
