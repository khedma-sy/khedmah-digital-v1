import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const capture = read('scripts/capture-sixth-audit-evidence.mjs');
const acceptance = read('scripts/check-classifieds-preview-acceptance.mjs');
const css = read('apps/frontend/app/classifieds/classifieds.module.css');

function rgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}
function luminance(hex) {
  const components = rgb(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * components[0] + 0.7152 * components[1] + 0.0722 * components[2];
}
function contrast(a, b) {
  const [bright, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (bright + 0.05) / (dark + 0.05);
}

test('sixth audit includes Restaurants, Delivery, Classifieds and anonymous account journeys', () => {
  assert.match(capture, /key: 'restaurants', path: '\/restaurants', href: '\/restaurants'/);
  assert.match(capture, /key: 'delivery', path: '\/mobility', href: '\/mobility\?type=delivery'/);
  assert.match(capture, /key: 'classifieds', path: '\/classifieds', href: '\/classifieds'/);
  for (const route of ['taxi-driver-signup', 'auth/login', 'auth/register']) assert.ok(capture.includes(`path: '/${route}'`));
  assert.match(capture, /assessAuthEvidence/);
  assert.match(capture, /sixthAuditRoutes\.length \* evidenceViewports\.length \* evidenceThemes\.length/);
  assert.match(capture, /RTL_NOT_APPLIED/);
  assert.match(capture, /directionSnapshot/);
  assert.match(capture, /htmlDir !== 'rtl'/);
  assert.match(capture, /bodyDirection !== 'rtl'/);
  assert.doesNotMatch(capture, /BEFORE_URL|PRODUCTION_GOOGLE_CLOUD_PROJECT|production/i);
});

test('sixth audit visuals are executed by the existing read-only Preview evidence step', () => {
  assert.match(acceptance, /captureSixthAuditEvidence/);
  assert.match(acceptance, /sixthAuditVisualReport/);
  assert.match(acceptance, /classifiedsReport\.status !== 'passed' \|\| sixthAuditVisualReport\.status !== 'passed'/);
});

test('Classifieds pale orange actions retain measurable paint and theme-aware text', () => {
  assert.match(css, /\.page :global\(\.ui-action-primary\)\{color:var\(--k-color-text\);background:var\(--k-color-orange-tint\)\}/);
  assert.match(css, /\.page :global\(\.ui-action-primary:hover\)\{color:var\(--k-color-text\);background:var\(--k-color-orange-fade\)\}/);
  assert.doesNotMatch(css, /ui-action-primary:hover[^\n]*84%,#000/);
  assert.ok(contrast('#143653', '#fd9603') >= 4.5, 'canonical dark text must meet normal-text contrast on Khedmah orange');
  assert.ok(contrast('#ffffff', '#fd9603') < 4.5, 'white must remain rejected on Khedmah orange for normal text');
});

test('service gradients retain normal-text contrast throughout the fade in both themes', () => {
  const tokens = read('apps/frontend/app/design-tokens.css');
  const colors = (block) => Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*(#[\da-f]{6});/gi)].map(([, key, value]) => [key, value]));
  const light = colors(tokens.match(/:root\s*\{([^}]+)\}/)[1]);
  const dark = { ...light, ...colors(tokens.match(/:root\[data-theme='dark'\]\s*\{([^}]+)\}/)[1]) };
  assert.equal(light['--k-color-surface'], '#ffffff', 'light gradients must finish in white');
  for (const [theme, palette] of Object.entries({ light, dark })) {
    for (const tone of ['blue', 'green', 'orange']) {
      const gradient = tokens.match(new RegExp(String.raw`--k-gradient-${tone}:\s*([^;]+);`))[1];
      const stops = [...gradient.matchAll(/var\((--[\w-]+)\)/g)].map(([, key]) => palette[key]);
      assert.equal(stops.length, 3);
      assert.equal(stops.at(-1), palette['--k-color-surface']);
      for (let segment = 0; segment < stops.length - 1; segment++) {
        for (let step = 0; step <= 100; step++) {
          const start = rgb(stops[segment]);
          const end = rgb(stops[segment + 1]);
          const background = '#' + start.map((channel, index) => Math.round(channel + (end[index] - channel) * step / 100).toString(16).padStart(2, '0')).join('');
          for (const key of ['--k-color-text', '--k-color-text-muted', `--k-color-${tone}-text`]) {
            assert.ok(contrast(palette[key], background) >= 4.5, `${theme}/${tone}/${key} must remain readable at segment ${segment}, step ${step}`);
          }
        }
      }
    }
  }
});
