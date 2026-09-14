import assert from 'node:assert/strict';
import { globSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { assessAuthEvidence, assessDesignLayout } from '../scripts/page-design-evidence.mjs';
import { assessEvidence } from '../scripts/capture-preview-evidence.mjs';

function undefinedTokens(files) {
  const declarations = new Set();
  const uses = [];
  for (const [path, source] of files) {
    const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const match of css.matchAll(/(--k-[\w-]+)\s*:/g)) declarations.add(match[1]);
    for (const match of css.matchAll(/var\(\s*(--k-[\w-]+)\s*\)/g)) uses.push({ path, token: match[1] });
  }
  return uses.filter(({ token }) => !declarations.has(token));
}

test('shared Khedmah CSS variables without fallbacks have declarations', () => {
  const files = globSync('apps/frontend/{app,styles}/**/*.css').map((path) => [path, readFileSync(path, 'utf8')]);
  assert.ok(files.length > 30);
  assert.deepEqual(undefinedTokens(files), []);
  assert.deepEqual(undefinedTokens([['fixture.css', '.form { gap:var(--k-missing); padding:var(--k-optional,1rem) }']]),
    [{ path: 'fixture.css', token: '--k-missing' }]);
});

test('computed spacing rejects zero padding, collapsed gaps and absent surfaces', () => {
  const valid = { key: 'search', htmlDir: 'rtl', direction: 'rtl', missingTokens: [],
    samples: [{ label: 'form', padding: 16, minimumPadding: 16, gap: 16, minimumGap: 16 }] };
  assert.equal(assessDesignLayout(valid).status, 'passed');
  for (const field of ['padding', 'gap']) assert.equal(assessDesignLayout({ ...valid, samples: [{ ...valid.samples[0], [field]: 0 }] }).status, 'failed');
  assert.equal(assessDesignLayout({ ...valid, samples: [] }).status, 'failed');
  assert.equal(assessDesignLayout({ ...valid, missingTokens: ['--k-space-4'] }).status, 'failed');
  assert.equal(assessDesignLayout({ ...valid, direction: 'ltr' }).status, 'failed');
});

test('guest driver evidence rejects editable forms and incomplete journey steps', () => {
  const valid = { key: 'taxi-signup', htmlDir: 'rtl', direction: 'rtl', missingTokens: [],
    samples: [0, 1].map((index) => ({ label: `panel ${index}`, padding: 16, minimumPadding: 16, gap: 16, minimumGap: 0 })),
    signup: { loginHref: '/auth/login?next=%2Ftaxi-driver-signup', formCount: 0, stepCount: 6 } };
  assert.equal(assessDesignLayout(valid).status, 'passed');
  for (const mutation of [{ formCount: 1 }, { stepCount: 5 }, { loginHref: '/auth/login' }]) {
    assert.ok(assessDesignLayout({ ...valid, signup: { ...valid.signup, ...mutation } }).failures.includes('GUEST_DRIVER_JOURNEY_INVALID'));
  }
});

test('auth shell has an explicit gate and cannot satisfy the public navigation gate', () => {
  const snapshot = { theme: 'light', mainCount: 1, headingLength: 12, authReady: true, headerCount: 0,
    navigationCount: 0, navigationInteractiveCount: 0, navigationHrefs: [], busyCount: 0, alertCount: 0,
    incompleteImageCount: 0, fontStatus: 'loaded', overflowPx: 0, formNamed: true };
  const shell = { brandCount: 1, tabCount: 2, currentTabCount: 1, switchHrefValid: true };
  const assess = (value, frame = shell) => assessAuthEvidence(value, frame, 200, true, 0, 'light');
  assert.deepEqual(assess(snapshot), []);
  assert.ok(assessEvidence(snapshot, 200, true).includes('NAVIGATION_DESTINATIONS_CHANGED'));
  for (const mutation of [{ headingLength: 0 }, { formNamed: false }, { alertCount: 1 }, { overflowPx: 2 }, { authReady: false }, { headerCount: 1 }]) assert.ok(assess({ ...snapshot, ...mutation }).length);
  for (const mutation of [{ brandCount: 0 }, { currentTabCount: 0 }, { switchHrefValid: false }]) assert.ok(assess(snapshot, { ...shell, ...mutation }).length);
  assert.ok(assessAuthEvidence(snapshot, shell, 500, true, 0, 'light').includes('HTTP_NOT_SUCCESS'));
  assert.ok(assessAuthEvidence(snapshot, shell, 200, false, 0, 'light').includes('UNEXPECTED_REDIRECT'));
  assert.ok(assessAuthEvidence(snapshot, shell, 200, true, 1, 'light').includes('BROWSER_RUNTIME_ERROR'));
});
