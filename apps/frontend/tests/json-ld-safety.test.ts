import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { serializeJsonLd } from '../lib/json-ld';

test('JSON-LD escapes literal angle brackets and cannot terminate its script element', () => {
  const name = '</script><script>alert(1)</script>';
  const serialized = serializeJsonLd({ '@type': 'LocalBusiness', name, description: '<img src=x>' });
  assert.ok(!serialized.includes('<'), 'no literal less-than characters may reach the script');
  assert.ok(serialized.includes('\\u003c/script>'));
  assert.ok(serialized.includes('\\u003cimg src=x>'));
  assert.deepEqual(JSON.parse(serialized).name, name, 'structured data retains its text semantically');
});

test('the public business profile injects only the safely serialized JSON-LD', () => {
  const source = readFileSync(new URL('../app/business-profiles/[id]/page.tsx', import.meta.url), 'utf8');
  assert.match(source, /dangerouslySetInnerHTML=\{\{ __html: serializeJsonLd\(jsonLd\) \}\}/);
  assert.doesNotMatch(source, /__html:\s*JSON\.stringify\(jsonLd\)/);
});
