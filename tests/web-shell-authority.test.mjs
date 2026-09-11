import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// Source-contract checks, not a substitute for computed styles in the live preview.
function declarations(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const matches = [...clean.matchAll(new RegExp(`(?:^|[{}])\\s*${escaped}\\s*\\{([^{}]*)\\}`, 'g'))];
  assert.equal(matches.length, 1, `Expected one canonical rule for ${selector}`);
  return Object.fromEntries(matches[0][1].split(';').filter((part) => part.trim()).map((part) => {
    const separator = part.indexOf(':');
    assert.ok(separator > 0, `Invalid declaration in ${selector}`);
    return [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
  }));
}

// WCAG 2.2 relative luminance, evaluated without rounding the acceptance threshold.
// https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
function luminance(hex) {
  assert.match(hex, /^#[0-9a-f]{6}$/i, 'Expected an opaque six-digit sRGB token');
  const channels = hex.slice(1).match(/../g).map((channel) => {
    const value = parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test('canonical shell loads after design tokens and legacy brand rules', async () => {
  const layout = await read('apps/frontend/app/layout.tsx');
  const tokens = layout.indexOf("./design-tokens.css");
  const brand = layout.indexOf("./brand-system.css");
  const shell = layout.indexOf("./shell-system.css");
  assert.ok(tokens >= 0);
  assert.ok(brand >= 0);
  assert.ok(shell > tokens);
  assert.ok(shell > brand);
});

test('global header remains owned by root layout and shell layer', async () => {
  const layout = await read('apps/frontend/app/layout.tsx');
  const shell = await read('apps/frontend/app/shell-system.css');
  assert.match(layout, /<header className="khedma-header">/);
  assert.match(shell, /\.khedma-header\{/);
  assert.match(shell, /position:sticky/);
});

for (const [state, suffix, background] of [
  ['normal', '', '--k-color-primary'],
  ['hover', ':hover', '--k-color-primary-hover']
]) {
  test(`shell login ${state} uses paired semantic colors instead of a fixed white foreground`, async () => {
    const shell = await read('apps/frontend/app/shell-system.css');
    const rule = declarations(shell, `.khedma-header .nav-session .nav-cta${suffix}`);
    assert.equal(rule.color, 'var(--k-color-on-primary)');
    assert.equal(rule.background, `var(${background})`);
    assert.equal(rule['border-color'], `var(${background})`);
  });
}

for (const theme of ['light', 'dark']) {
  for (const background of ['--k-color-primary', '--k-color-primary-hover']) {
    test(`${theme} login text meets 4.5:1 against ${background}`, async () => {
      const source = await read('apps/frontend/app/design-tokens.css');
      const tokens = declarations(source, theme === 'light' ? ':root' : ":root[data-theme='dark']");
      const ratio = contrast(tokens['--k-color-on-primary'], tokens[background]);
      assert.ok(ratio >= 4.5, `${theme} ${background} contrast is ${ratio}:1`);
    });
  }
}

test('contrast guard is calibrated and detects the former dark-mode white-text regression', async () => {
  assert.equal(contrast('#000000', '#ffffff'), 21);
  assert.equal(contrast('#07427c', '#07427c'), 1);
  const tokens = declarations(await read('apps/frontend/app/design-tokens.css'), ":root[data-theme='dark']");
  for (const background of ['--k-color-primary', '--k-color-primary-hover']) {
    assert.ok(contrast('#ffffff', tokens[background]) < 4.5);
  }
});
