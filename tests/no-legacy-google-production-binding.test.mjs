import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const SCAN_ROOTS = ['.github', 'apps', 'config', 'infra', 'scripts', 'tests'];
const ROOT_FILES = [
  'cloudbuild.production.yaml',
  'cloudbuild.migration.yaml',
  'cloudbuild.classifieds-migration.yaml',
  'cloudbuild.production-migrations-025-034.yaml',
  '.env.example',
  '.env.production'
];
const TEXT_EXTENSIONS = new Set(['.yml', '.yaml', '.json', '.js', '.mjs', '.ts', '.tsx', '.sh', '.tf', '.md', '.env', '']);
const FORBIDDEN = [
  'project-94512a0e-1a5e-4bdb-87f',
  '774201339973'
];

async function walk(dirUrl) {
  const entries = await readdir(dirUrl, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (['node_modules', '.next', 'dist', 'build', '.git'].includes(entry.name)) continue;
    const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dirUrl);
    if (entry.isDirectory()) files.push(...await walk(child));
    else if (TEXT_EXTENSIONS.has(extname(entry.name))) files.push(child);
  }
  return files;
}

test('production/runtime sources contain no legacy Google project identifiers', async () => {
  const files = [];
  for (const root of SCAN_ROOTS) {
    try { files.push(...await walk(new URL(`${root}/`, ROOT))); } catch {}
  }
  for (const file of ROOT_FILES) {
    try { files.push(new URL(file, ROOT)); } catch {}
  }

  const failures = [];
  for (const file of files) {
    const path = relative(new URL('.', ROOT).pathname, file.pathname);
    if (path.endsWith('tests/no-legacy-google-production-binding.test.mjs')) continue;
    const text = await readFile(file, 'utf8');
    for (const token of FORBIDDEN) {
      if (text.includes(token)) failures.push(`${path}: ${token}`);
    }
  }
  assert.deepEqual(failures, [], `Legacy Google production binding remains:\n${failures.join('\n')}`);
});
