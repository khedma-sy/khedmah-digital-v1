import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [target] : [];
  }));
  return nested.flat();
}

test('Arabic interface keeps Latin 0-9 numerals across all frontend sources', async () => {
  const roots = [
    path.resolve(testDirectory, '../app'),
    path.resolve(testDirectory, '../components'),
  ];
  const files = (await Promise.all(roots.map(sourceFiles))).flat();
  const contents = await Promise.all(files.map(async (file) => [file, await readFile(file, 'utf8')] as const));
  for (const [file, source] of contents) {
    assert.doesNotMatch(source, /[٠-٩]/, `${file} contains Arabic-Indic numerals`);
    assert.doesNotMatch(source, /toLocale(?:String|DateString|TimeString)\(['"]ar-SY['"]/, `${file} uses Arabic-Indic locale output`);
  }
});
