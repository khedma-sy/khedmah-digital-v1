import { spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const testTargets = Object.freeze([
  Object.freeze({ name: 'root', args: ['run', 'test:root'] }),
  Object.freeze({ name: 'backend workspace', args: ['--workspace', 'apps/backend', 'run', 'test'] }),
  Object.freeze({ name: 'frontend workspace', args: ['--workspace', 'apps/frontend', 'run', 'test'] }),
]);

const failures = [];

for (const target of testTargets) {
  process.stdout.write(`\n=== Khedmah test target: ${target.name} ===\n`);
  const result = spawnSync(npmCommand, target.args, { stdio: 'inherit' });
  const exitCode = result.status ?? 1;
  if (exitCode !== 0) failures.push(Object.freeze({ name: target.name, exitCode }));
}

if (failures.length > 0) {
  process.stderr.write(`\nCanonical test run failed: ${failures.map(({ name, exitCode }) => `${name} (exit ${exitCode})`).join(', ')}.\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('\nCanonical test run passed: root, backend workspace, and frontend workspace.\n');
}
