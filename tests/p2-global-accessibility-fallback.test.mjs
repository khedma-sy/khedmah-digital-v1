import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const layout = await readFile(new URL('../apps/frontend/app/layout.tsx', import.meta.url), 'utf8');
const a11y = await readFile(new URL('../apps/frontend/app/accessibility-system.css', import.meta.url), 'utf8');

test('final accessibility stylesheet is loaded after feature styles', () => {
  const authIndex = layout.indexOf("import './auth-experience.css';");
  const a11yIndex = layout.indexOf("import './accessibility-system.css';");
  assert.ok(authIndex >= 0 && a11yIndex > authIndex);
});

test('all common keyboard-operable controls have a high-contrast focus-visible fallback', () => {
  assert.match(a11y, /:is\(a\[href\],button,input,select,textarea,summary,\[tabindex\]:not\(\[tabindex='-1'\]\)\):focus-visible/);
  assert.match(a11y, /outline:3px solid var\(--k-color-primary\)/);
  assert.match(a11y, /outline-offset:3px/);
});

test('reduced-motion preference disables nonessential transitions and scrolling animation', () => {
  assert.match(a11y, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(a11y, /animation-duration:\.01ms!important/);
  assert.match(a11y, /transition-duration:\.01ms!important/);
  assert.match(a11y, /scroll-behavior:auto!important/);
});
