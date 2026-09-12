import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const navigation = await readFile('apps/frontend/app/auth-navigation.tsx', 'utf8');
const shell = await readFile('apps/frontend/app/shell-system.css', 'utf8');
const themes = await readFile('apps/frontend/app/section-themes.css', 'utf8');
const home = await readFile('apps/frontend/app/page.tsx', 'utf8');
const homeStyles = await readFile('apps/frontend/app/home.module.css', 'utf8');
const food = await readFile('apps/frontend/app/food/page.tsx', 'utf8');
const taxi = await readFile('apps/frontend/app/taxi/page.tsx', 'utf8');
const taxiMap = await readFile('apps/frontend/app/taxi/taxi-map-selector.tsx', 'utf8');
const previewEvidence = await readFile('scripts/capture-preview-evidence.mjs', 'utf8');

test('primary navigation exposes Food and Store without removing discovery', () => {
  for (const route of ['/search', '/categories', '/food', '/map', '/taxi', '/store', '/classifieds']) {
    assert.match(navigation, new RegExp(`href: '${route.replace(/[?]/g, '\\?')}'`));
  }
});

test('mobile primary navigation keeps all services visible instead of hiding them in an overflow rail', () => {
  assert.match(shell, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.doesNotMatch(shell, /\.nav-discovery-group\{[\s\S]*?overflow-x:auto/);
});

test('section identity uses the approved Khedmah brand colors', () => {
  assert.match(themes, /--brand-navy:\s*#07427c/i);
  assert.match(themes, /--brand-green:\s*#81be49/i);
  assert.match(themes, /--brand-orange:\s*#fd9603/i);
});

test('homepage restores blue identity and prioritizes launch services', () => {
  assert.match(home, /href: '\/food'/);
  assert.match(home, /href: '\/mobility\?type=delivery'/);
  assert.match(home, /href: '\/taxi'/);
  assert.match(home, /href="\/store"/);
  assert.match(homeStyles, /#07427c/i);
  assert.match(homeStyles, /\.foodCard/);
  assert.match(homeStyles, /\.deliveryCard/);
  assert.match(homeStyles, /\.taxiCard/);
});

test('Food is a dedicated page backed by real category search links', () => {
  for (const category of ['restaurant', 'cafe', 'bakery', 'sweets']) {
    assert.match(food, new RegExp(`code: '${category}'`));
  }
  assert.match(food, /\/search\?type=business&categoryCode=/);
  assert.doesNotMatch(food, /طلبك تم|تم الدفع|تتبع الطلب/);
});

test('Taxi keeps map selection inside the Taxi journey', () => {
  assert.match(taxi, /TaxiMapSelector/);
  assert.doesNotMatch(taxi, /href="\/map"/);
  assert.match(taxiMap, /NEXT_PUBLIC_GOOGLE_MAPS_API_KEY/);
  assert.match(taxiMap, /maps\.googleapis\.com\/maps\/api\/js/);
  assert.match(taxiMap, /map\.addListener\('click'/);
  assert.match(taxiMap, /draggable:\s*true/);
  assert.match(taxiMap, /data-taxi-map-status=\{mapStatus\}/);
});

test('Preview evidence cannot skip Food Store or Taxi again', () => {
  assert.match(previewEvidence, /key: 'food', path: '\/food'/);
  assert.match(previewEvidence, /key: 'taxi', path: '\/taxi'/);
  assert.match(previewEvidence, /key: 'store', path: '\/store'/);
  assert.match(previewEvidence, /snapshot\.navigationCount !== 7/);
  assert.match(previewEvidence, /\/search\|\/categories\|\/food\|\/map\|\/taxi\|\/store\|\/classifieds/);
  assert.match(previewEvidence, /data-taxi-map-status/);
});
