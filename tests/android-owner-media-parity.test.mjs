import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('Android owner journey uses the same secure media API', async () => {
  const api = await read('../apps/android/app/src/main/java/com/khedmah/digital/KhedmahApi.kt');
  const screen = await read('../apps/android/app/src/main/java/com/khedmah/digital/OwnerBusinessScreen.kt');
  for (const path of ['/api/v1/businesses/my', '/api/v1/media']) assert.match(api, new RegExp(path.replaceAll('/', '\\/')));
  assert.match(api, /ownerType.*business_profile/);
  assert.match(api, /Base64\.NO_WRAP/);
  assert.match(screen, /ActivityResultContracts\.GetContent/);
  assert.match(screen, /AsyncImage/);
  assert.match(screen, /logo.*cover.*gallery/s);
});

test('Android native session requests are CSRF-distinct without weakening browser origins', async () => {
  const api = await read('../apps/android/app/src/main/java/com/khedmah/digital/KhedmahApi.kt');
  const csrf = await read('../apps/backend/src/middleware/csrf-origin.middleware.ts');
  assert.match(api, /X-Khedmah-Client.*android/);
  assert.match(csrf, /nativeClient === 'android'/);
  assert.match(csrf, /!request\.headers\.origin && !request\.headers\.referer/);
  assert.match(csrf, /allowedOrigins\.has/);
});

test('backend explicitly accepts the bounded base64 media body', async () => {
  const app = await read('../apps/backend/src/app.ts');
  assert.match(app, /bodyParser: false/);
  assert.match(app, /useBodyParser\('json', \{ limit: '7mb' \}\)/);
});
