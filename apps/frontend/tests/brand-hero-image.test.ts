import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { KHEDMAH_HERO_IMAGE } from '../lib/brand-hero-image';

test('brand hero image is the exact reviewed WebP after source refactoring', () => {
  assert.match(KHEDMAH_HERO_IMAGE, /^data:image\/webp;base64,/);
  const encoded = KHEDMAH_HERO_IMAGE.slice('data:image/webp;base64,'.length);
  const bytes = Buffer.from(encoded, 'base64');
  assert.equal(bytes.byteLength, 135432);
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),
    'ba1cd4812f399f96aae24487682c468ed069f86354da1c30f6333af1ba0b9a1e');
});
