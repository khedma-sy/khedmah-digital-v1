import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('admin approval uses the atomic approve-and-publish endpoints', async () => {
  const [page, client] = await Promise.all([
    read('app/admin/moderation/page.tsx'),
    read('lib/api-client.ts')
  ]);

  assert.match(page, /api\.businesses\.approveAndPublish\(id\)/);
  assert.match(page, /api\.professionals\.approveAndPublish\(id\)/);
  assert.match(client, /\/businesses\/\$\{id\}\/moderation\/approve-and-publish/);
  assert.match(client, /\/professionals\/\$\{id\}\/moderation\/approve-and-publish/);
});

test('mobility publication requires four individually approved private documents', async()=>{
  const [page,client]=await Promise.all([read('app/admin/moderation/page.tsx'),read('lib/api-client.ts')]);
  assert.match(page,/reviewDriverDocument/);
  assert.match(page,/documentReviewStatus==='approved'/);
  assert.match(page,/الوثائق المعتمدة/);
  assert.match(client,/driver-document-review/);
});
