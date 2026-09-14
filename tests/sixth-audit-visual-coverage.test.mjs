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

test('sixth audit adds exactly Restaurants, Delivery and Classifieds After-only visual coverage', () => {
  assert.match(capture, /key: 'restaurants', path: '\/restaurants', href: '\/restaurants'/);
  assert.match(capture, /key: 'delivery', path: '\/mobility', href: '\/mobility\?type=delivery'/);
  assert.match(capture, /key: 'classifieds', path: '\/classifieds', href: '\/classifieds'/);
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

test('Classifieds orange primary actions use the accessible dark semantic foreground', () => {
  assert.match(css, /\.page :global\(\.ui-action-primary\)\{color:var\(--k-color-on-accent\);background:var\(--ads-accent\)\}/);
  assert.match(css, /\.page :global\(\.ui-action-primary:hover\)\{color:var\(--k-color-on-accent\);background:color-mix\(in srgb,var\(--ads-accent\) 90%,#fff\)\}/);
  assert.doesNotMatch(css, /ui-action-primary:hover[^\n]*84%,#000/);
  assert.ok(contrast('#143653', '#fd9603') >= 4.5, 'canonical dark text must meet normal-text contrast on Khedmah orange');
  assert.ok(contrast('#ffffff', '#fd9603') < 4.5, 'white must remain rejected on Khedmah orange for normal text');
});
