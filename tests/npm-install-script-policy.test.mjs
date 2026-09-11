import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const reviewed = {
  '@firebase/util@1.15.1': true,
  'esbuild@0.25.12': true,
  'protobufjs@7.6.5': true
};

test('dependency install scripts are restricted to the reviewed pinned set', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.deepEqual(pkg.allowScripts, reviewed);
  assert.ok(Object.keys(pkg.allowScripts).every((entry) => /@\d+\.\d+\.\d+$/.test(entry)), 'every approved install script must be version-pinned');
});

test('npm install-script enforcement is strict and has no global bypass', async () => {
  const npmrc = await readFile(new URL('../.npmrc', import.meta.url), 'utf8');
  assert.match(npmrc, /^strict-allow-scripts=true\s*$/m);
  assert.doesNotMatch(npmrc, /dangerously-allow-all-scripts\s*=\s*true/i);
  assert.doesNotMatch(npmrc, /ignore-scripts\s*=\s*true/i);
});
