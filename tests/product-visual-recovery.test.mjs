import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const navigation = await readFile('apps/frontend/app/auth-navigation.tsx', 'utf8');
const layout = await readFile('apps/frontend/app/layout.tsx', 'utf8');
const brandMark = await readFile('apps/frontend/app/components/brand-mark.tsx', 'utf8');
const categoryDirectory = await readFile('apps/frontend/app/components/category-directory.tsx', 'utf8');
const shell = await readFile('apps/frontend/app/shell-system.css', 'utf8');
const themes = await readFile('apps/frontend/app/section-themes.css', 'utf8');
const home = await readFile('apps/frontend/app/page.tsx', 'utf8');
const homeStyles = await readFile('apps/frontend/app/home.module.css', 'utf8');
const homeSystem = await readFile('apps/frontend/app/home-system.css', 'utf8');
const food = await readFile('apps/frontend/app/food/page.tsx', 'utf8');
const taxi = await readFile('apps/frontend/app/taxi/page.tsx', 'utf8');
const taxiLayout = await readFile('apps/frontend/app/taxi/layout.tsx', 'utf8');
const taxiPlanningPreview = await readFile('apps/frontend/app/taxi/taxi-planning-preview.tsx', 'utf8');
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

test('primary brand stays خدمة and stacks the umbrella above the name', () => {
  assert.match(layout, /const SITE_NAME = 'خدمة';/);
  assert.doesNotMatch(layout, /const SITE_NAME = 'خدمة ديجتل';/);
  assert.match(brandMark, /aria-label="خدمة - تحت مظلة واحدة"/);
  assert.match(brandMark, /<b>خدمة<\/b>/);
  assert.doesNotMatch(brandMark, /خدمة ديجتل/);
  assert.match(shell, /\.khedma-header \.khedma-brand\{[^}]*display:grid/);
  assert.match(shell, /\.khedma-header \.khedma-brand>svg\{width:2\.45rem/);
  assert.doesNotMatch(home, /خدمة ديجتل/);
});

test('category icons use semantic official brand tones instead of one global blue', () => {
  assert.match(categoryDirectory, /type CategoryTone = 'navy' \| 'green' \| 'orange'/);
  assert.match(categoryDirectory, /food: 'orange'/);
  assert.match(categoryDirectory, /transport: 'green'/);
  assert.match(categoryDirectory, /data-category-tone=\{categoryTone\(category\.visualKey\)\}/);
  assert.match(themes, /catalog-category-icon\[data-category-tone='green'\]/);
  assert.match(themes, /catalog-category-icon\[data-category-tone='orange'\]/);
  assert.match(themes, /catalog-category-icon\[data-category-tone='navy'\]/);
});

test('homepage restores blue identity and prioritizes launch services', () => {
  assert.match(home, /href: '\/food'/);
  assert.match(home, /href: '\/mobility\?type=delivery'/);
  assert.match(home, /href: '\/taxi'/);
  assert.match(home, /href="\/store"/);
  assert.match(homeStyles, /linear-gradient\(135deg,#052f59 0%,#07427c 58%,#0b4f8e 100%\)/i);
  assert.match(homeStyles, /\.foodCard/);
  assert.match(homeStyles, /\.deliveryCard/);
  assert.match(homeStyles, /\.taxiCard/);
  assert.match(homeSystem, />section:first-child\{background-color:/);
  assert.doesNotMatch(homeSystem, />section:first-child\{background:/);
  assert.doesNotMatch(homeSystem, />section\{background:/);
});

test('Food is a dedicated page backed by real category search links', () => {
  for (const category of ['restaurant', 'cafe', 'bakery', 'sweets']) {
    assert.match(food, new RegExp(`code: '${category}'`));
  }
  assert.match(food, /\/search\?type=business&categoryCode=/);
  assert.doesNotMatch(food, /طلبك تم|تم الدفع|تتبع الطلب/);
});

test('Taxi keeps map selection inside the Taxi journey and never prices placeholder coordinates', () => {
  assert.match(taxi, /TaxiMapSelector/);
  assert.doesNotMatch(taxi, /href="\/map"/);
  assert.match(taxi, /latitude: Number\.NaN, longitude: Number\.NaN/);
  assert.doesNotMatch(taxi, /latitude: 33\.5138, longitude: 36\.2765/);
  assert.match(taxi, /!validCoordinates\(pickup\) \|\| !validCoordinates\(dropoff\)/);
  assert.match(taxi, /حدد نقطة الانطلاق والوجهة على الخريطة أو أدخل الإحداثيات يدويًا قبل حساب السعر/);
  assert.match(taxiMap, /NEXT_PUBLIC_GOOGLE_MAPS_API_KEY/);
  assert.match(taxiMap, /maps\.googleapis\.com\/maps\/api\/js/);
  assert.match(taxiMap, /callback=initKhedmahTaxiMap/);
  assert.match(taxiMap, /gm_authFailure/);
  assert.match(taxiMap, /map\.addListener\('tilesloaded'/);
  assert.match(taxiMap, /map\.addListener\('click'/);
  assert.match(taxiMap, /valid\(start\) && !valid\(end\) && selectionRef\.current === 'pickup'/);
  assert.match(taxiMap, /if \(!pickupMarkerRef\.current\)/);
  assert.match(taxiMap, /if \(!dropoffMarkerRef\.current\)/);
  assert.match(taxiMap, /if \(!lineRef\.current\)/);
  assert.match(taxiMap, /draggable:\s*true/);
  assert.match(taxiMap, /data-taxi-map-status=\{mapStatus\}/);
  assert.doesNotMatch(taxiMap, /addEventListener\('load'/);
});

test('Taxi rollout keeps execution fail-closed while map planning remains reviewable', () => {
  assert.match(taxiLayout, /process\.env\.TAXI_TRIPS_ENABLED === 'true'/);
  assert.match(taxiLayout, /TaxiPlanningPreview/);
  assert.match(taxiPlanningPreview, /TaxiMapSelector/);
  assert.match(taxiPlanningPreview, /data-taxi-trip-execution="disabled"/);
  assert.match(taxiPlanningPreview, /latitude: Number\.NaN, longitude: Number\.NaN/);
  assert.doesNotMatch(taxiPlanningPreview, /latitude: 33\.5138|longitude: 36\.2765/);
  assert.doesNotMatch(taxiPlanningPreview, /taxiApi|rider\.quote|rider\.place|driver\./);
});

test('Preview evidence cannot skip Food Store or Taxi again', () => {
  assert.match(previewEvidence, /key: 'food', path: '\/food'/);
  assert.match(previewEvidence, /key: 'taxi', path: '\/taxi'/);
  assert.match(previewEvidence, /key: 'store', path: '\/store'/);
  assert.match(previewEvidence, /snapshot\.navigationCount !== 7/);
  assert.match(previewEvidence, /\/search\|\/categories\|\/food\|\/map\|\/taxi\|\/store\|\/classifieds/);
  assert.match(previewEvidence, /data-taxi-map-status/);
  assert.match(previewEvidence, /MAP_SURFACE_MISSING/);
  assert.match(previewEvidence, /route\.key === 'map' \|\| route\.key === 'taxi'/);
});
