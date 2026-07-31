import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const nodeArgs = [];
const patterns = [];

for (const arg of process.argv.slice(2)) {
  if (arg.startsWith('--node-arg=')) {
    nodeArgs.push(arg.slice('--node-arg='.length));
  } else {
    patterns.push(arg);
  }
}

if (patterns.length === 0) {
  throw new Error('At least one test pattern is required.');
}

const testFiles = [...new Set(patterns.flatMap(collectMatches))].sort();

if (testFiles.length === 0) {
  throw new Error(`No test files matched: ${patterns.join(', ')}`);
}

const result = spawnSync(process.execPath, [...nodeArgs, '--test', ...testFiles], {
  stdio: 'inherit',
});

process.exit(result.status ?? 1);

function collectMatches(pattern) {
  const recursiveMarker = '/**/';
  const markerIndex = pattern.indexOf(recursiveMarker);

  if (markerIndex === -1) return [pattern];

  const baseDir = pattern.slice(0, markerIndex);
  const suffix = pattern.slice(markerIndex + recursiveMarker.length).replace(/^\*/, '');

  return walk(baseDir)
    .filter(path => path.endsWith(suffix));
}

function walk(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...walk(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }

  return files;
}
