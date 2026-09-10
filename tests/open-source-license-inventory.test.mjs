import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const packages = Object.entries(lock.packages ?? {})
  .filter(([path, metadata]) => path.startsWith('node_modules/') && metadata && typeof metadata === 'object');

const strongCopyleft = /(?:^|\(|\s|OR|AND)(?:AGPL|GPL|SSPL|EUPL|OSL)-?/i;
const unknown = [];
const reviewRequired = [];

for (const [path, metadata] of packages) {
  const license = typeof metadata.license === 'string' ? metadata.license.trim() : '';
  if (!license || /^UNLICENSED$/i.test(license) || /^UNKNOWN$/i.test(license)) {
    unknown.push(path);
    continue;
  }
  if (strongCopyleft.test(license)) reviewRequired.push(`${path}: ${license}`);
}

test('npm production dependency inventory has explicit license metadata', () => {
  assert.ok(packages.length > 0, 'package-lock dependency inventory must not be empty');
  assert.deepEqual(
    unknown,
    [],
    `Dependencies with missing/unknown license metadata require manual review before release:\n${unknown.join('\n')}`
  );
});

test('strong-copyleft npm dependencies require an explicit legal review before release', () => {
  assert.deepEqual(
    reviewRequired,
    [],
    `Strong-copyleft or source-available license expressions require explicit review:\n${reviewRequired.join('\n')}`
  );
});
