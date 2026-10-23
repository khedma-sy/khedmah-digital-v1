import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

test('body-parser compressed-body advisory stays patched in the production lock', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const lock = JSON.parse(fs.readFileSync(root + '/package-lock.json', 'utf8'));
  const packages = lock.packages ?? {};

  const express = packages['node_modules/express'];
  const bodyParser = packages['node_modules/body-parser'];
  const contentType = packages['node_modules/body-parser/node_modules/content-type'];
  const qs = packages['node_modules/qs'];
  const iconv = packages['node_modules/iconv-lite'];

  assert.equal(lock.lockfileVersion, 3);
  assert.equal(express?.version, '5.2.1');
  assert.equal(express?.dependencies?.['body-parser'], '^2.2.1');

  assert.equal(bodyParser?.version, '2.4.0');
  assert.equal(bodyParser?.resolved,
    'https://registry.npmjs.org/body-parser/-/body-parser-2.4.0.tgz');
  assert.equal(bodyParser?.integrity,
    'sha512-Ifk1KcLrxaGt1occQagQNFNNOqRt1LFuehEnHHzB8Z6cRgIxRU1TBaiIsUiCdA+gy5PL7Y1IX31DNKkRmxtXjQ==');
  assert.equal(bodyParser?.dependencies?.['content-type'], '^2.1.0');
  assert.equal(bodyParser?.dependencies?.['iconv-lite'], '^0.7.3');
  assert.equal(bodyParser?.dependencies?.qs, '^6.16.1');

  assert.equal(contentType?.version, '2.1.0');
  assert.equal(contentType?.integrity,
    'sha512-mj7UPXE0jaqaOsukNZRUEfEi2AcL7C/vwmwcHV0O97eO1E1pxBZuyjlZrx5seTaNBg1U6+o35wpa35Qfcc+7ag==');
  assert.equal(qs?.version, '6.16.1');
  assert.equal(qs?.integrity,
    'sha512-5Px6J7rfHBAGUhNQ3es4YzcOdBBw0SDcVtThJml4RdnKw4tKs2epA0kPZ+K8X+WiHktT93RHVcQ/3ym5aTCgtg==');
  assert.equal(iconv?.version, '0.7.3');
});
