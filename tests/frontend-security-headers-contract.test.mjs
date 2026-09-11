import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const config = await readFile(new URL('../apps/frontend/next.config.ts', import.meta.url), 'utf8');

test('frontend disables framework disclosure and sets baseline browser security headers', () => {
  assert.match(config, /poweredByHeader:\s*false/);
  assert.match(config, /X-Content-Type-Options['"],\s*value:\s*['"]nosniff/);
  assert.match(config, /X-Frame-Options['"],\s*value:\s*['"]DENY/);
  assert.match(config, /Referrer-Policy['"],\s*value:\s*['"]strict-origin-when-cross-origin/);
  assert.match(config, /source:\s*['"]\/:path\*['"]/);
});
