import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const manualReview = JSON.parse(fs.readFileSync('docs/audits/npm-license-manual-review.json', 'utf8'));

const packages = Object.entries(lock.packages ?? {})
  .filter(([path, metadata]) => (
    path.startsWith('node_modules/')
    && metadata
    && typeof metadata === 'object'
    && metadata.link !== true
  ));

const reviewedLicenses = new Map(
  (manualReview.packages ?? []).map((entry) => [`${entry.name}@${entry.version}`, entry])
);
const strongCopyleft = /(?:^|\(|\s|OR|AND)(?:AGPL|GPL|SSPL|EUPL|OSL)-?/i;
const unknown = [];
const reviewRequired = [];
const consumedManualReviews = new Set();

function packageNameFromLockPath(path) {
  return path.split('node_modules/').at(-1);
}

for (const [path, metadata] of packages) {
  const packageName = packageNameFromLockPath(path);
  const version = typeof metadata.version === 'string' ? metadata.version.trim() : '';
  const lockLicense = typeof metadata.license === 'string' ? metadata.license.trim() : '';
  const reviewKey = `${packageName}@${version}`;
  const reviewed = reviewedLicenses.get(reviewKey);

  let license = lockLicense;
  if (!license && reviewed) {
    assert.match(reviewed.license ?? '', /\S/, `${reviewKey} manual review must declare a license`);
    assert.match(reviewed.reason ?? '', /\S/, `${reviewKey} manual review must explain why lockfile metadata is insufficient`);
    assert.match(reviewed.evidence ?? '', /^https:\/\/github\.com\//, `${reviewKey} manual review evidence must use an HTTPS GitHub source`);
    license = reviewed.license.trim();
    consumedManualReviews.add(reviewKey);
  }

  if (!license || /^UNLICENSED$/i.test(license) || /^UNKNOWN$/i.test(license)) {
    unknown.push(`${path}${version ? `@${version}` : ''}`);
    continue;
  }
  if (strongCopyleft.test(license)) reviewRequired.push(`${path}: ${license}`);
}

test('npm third-party dependency inventory has explicit or audited license metadata', () => {
  assert.ok(packages.length > 0, 'package-lock third-party dependency inventory must not be empty');
  assert.deepEqual(
    unknown,
    [],
    `Dependencies with missing/unknown license metadata require manual review before release:\n${unknown.join('\n')}`
  );
});

test('manual npm license reviews are exact, current and not stale', () => {
  assert.deepEqual(
    [...reviewedLicenses.keys()].sort(),
    [...consumedManualReviews].sort(),
    'Every manual license review must match a current dependency whose lockfile lacks license metadata'
  );
});

test('strong-copyleft npm dependencies require an explicit legal review before release', () => {
  assert.deepEqual(
    reviewRequired,
    [],
    `Strong-copyleft or source-available license expressions require explicit review:\n${reviewRequired.join('\n')}`
  );
});
