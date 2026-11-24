import assert from 'node:assert/strict';
import test from 'node:test';
import { serializeJsonLd } from '../lib/json-ld';

test('business structured data cannot terminate its script element', () => {
  const original = { name: '</script><script>alert(1)</script>', '@type': 'LocalBusiness' };
  const serialized = serializeJsonLd(original);
  assert.equal(serialized.includes('<'), false);
  assert.deepEqual(JSON.parse(serialized), original);
});
