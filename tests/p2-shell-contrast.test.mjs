import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const shell = await readFile(new URL('../apps/frontend/app/shell-system.css', import.meta.url), 'utf8');
const themes = await readFile(new URL('../apps/frontend/app/section-themes.css', import.meta.url), 'utf8');
const tokens = await readFile(new URL('../apps/frontend/app/design-tokens.css', import.meta.url), 'utf8');

function rgb(hex) {
  return [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
}
function mix(first, second, weight) {
  const a = rgb(first); const b = rgb(second);
  return a.map((value, index) => Math.round(value * weight + b[index] * (1 - weight)));
}
function channel(value) {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}
function luminance(values) {
  const [r, g, b] = values.map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(first, second) {
  const a = Array.isArray(first) ? luminance(first) : luminance(rgb(first));
  const b = Array.isArray(second) ? luminance(second) : luminance(rgb(second));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test('light registration text derives only from umbrella orange and navy and meets normal-text contrast', () => {
  assert.match(themes, /--brand-navy:\s*#07427c/);
  assert.match(themes, /--brand-orange:\s*#fd9603/);
  assert.match(shell, /nav-register\{[^}]*color:color-mix\(in srgb,var\(--brand-orange,#fd9603\) 55%,var\(--brand-navy,#07427c\)\)/);
  assert.ok(contrast(mix('#fd9603', '#07427c', 0.55), '#ffffff') >= 4.5);
});

test('dark registration text keeps the umbrella orange where it meets contrast', () => {
  assert.match(tokens, /--k-color-surface:\s*#1c2124/);
  assert.match(shell, /:root\[data-theme='dark'\][^{]*nav-register\{color:var\(--brand-orange,#fd9603\)\}/);
  assert.ok(contrast('#fd9603', '#1c2124') >= 4.5);
});
