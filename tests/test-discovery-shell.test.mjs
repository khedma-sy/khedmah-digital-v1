import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// Execute each real npm command through a POSIX shell with a capture-only node.
// A matching shallow file reproduces shell expansion that silently omits deeper tests.
for (const [path, script, pattern] of [
  ['package.json', 'test:root', 'tests/**/*.test.mjs'],
  ['apps/backend/package.json', 'test', 'src/**/*.test.ts'],
  ['apps/frontend/package.json', 'test', 'tests/**/*.test.ts']
]) test(`${path}: recursive test pattern reaches the runner unchanged`, () => {
  const directory = mkdtempSync(join(tmpdir(), 'khedmah-discovery-'));
  try {
    mkdirSync(join(directory, 'bin'));
    const base = pattern.split('/')[0]; const extension = pattern.endsWith('mjs') ? 'mjs' : 'ts';
    mkdirSync(join(directory, base, 'identity', 'email'), { recursive: true });
    writeFileSync(join(directory, base, 'identity', `shallow.test.${extension}`), '');
    writeFileSync(join(directory, base, 'identity', 'email', `nested.test.${extension}`), '');
    const captured = join(directory, 'args.json');
    writeFileSync(join(directory, 'bin/node'), `#!${process.execPath}\nrequire('node:fs').writeFileSync(process.env.CAPTURE_ARGS, JSON.stringify(process.argv.slice(2)));\n`, { mode: 0o755 });
    const command = JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')).scripts[script];
    const result = spawnSync('sh', ['-c', command], { cwd: directory, encoding: 'utf8', env: { ...process.env, PATH: `${join(directory, 'bin')}:${process.env.PATH}`, CAPTURE_ARGS: captured } });
    assert.equal(result.status, 0, result.stderr);
    const args = JSON.parse(readFileSync(captured, 'utf8'));
    assert.ok(args.includes(pattern), `Shell expanded ${pattern} before the recursive runner received it.`);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('canonical runner executes top-level and deeply nested tests once and preserves failures', () => {
  const directory = mkdtempSync(join(tmpdir(), 'khedmah-runner-'));
  const runner = fileURLToPath(new URL('../scripts/run-matched-tests.mjs', import.meta.url));
  try {
    for (const name of ['top', 'identity/one', 'identity/email/deep']) {
      const path = join(directory, `src/${name}.test.mjs`); mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, `import test from 'node:test'; test('${name}', () => {});\n`);
    }
    const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
    const run = () => spawnSync(process.execPath, [runner, '--node-arg=--test-reporter=tap', 'src/**/*.test.mjs', 'src/**/*.test.mjs'], { cwd: directory, encoding: 'utf8', env });
    let result = run(); assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /# tests 3\b/);
    writeFileSync(join(directory, 'src/identity/email/deep.test.mjs'), "import test from 'node:test'; test('deep fails', () => { throw new Error('test failure'); });\n");
    result = run(); assert.notEqual(result.status, 0); assert.match(result.stdout, /# fail 1\b/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
