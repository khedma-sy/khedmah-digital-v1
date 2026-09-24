import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('owner hosting audit uses only bounded read-only metadata operations (Python unit suite)', () => {
  execFileSync('python3', ['tests/new-google-hosting-readonly.test.py'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8', timeout: 15000,
  });
});
