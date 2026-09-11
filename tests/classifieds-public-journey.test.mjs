import assert from 'node:assert/strict';
import test from 'node:test';
import { clientPage, primitives, css, deferred, readSource } from './helpers/client-page-harness.mjs';

const ad = (titleAr = 'إعلان حديث', id = 'a') => ({
  id, kind: 'sale', titleAr, categoryCode: 'shopping', priceMode: 'none', contactMode: 'profile', status: 'active',
  imageUrls: [], createdAt: '2026-09-10T00:00:00.000Z', updatedAt: '2026-09-10T00:00:00.000Z', cityCode: 'damascus'
});

function fixture({ query = '', categoryError = '', cityError = '', cityLoading = false } = {}) {
  let params = new URLSearchParams(query);
  let categories = { categories: [{ code: 'shopping', nameAr: 'تسوق' }], isLoading: false, error: categoryError, retry: () => { categoryRetries += 1; } };
  let cities = { cities: [{ code: 'damascus', nameAr: 'دمشق' }, { code: 'aleppo', nameAr: 'حلب' }], isLoading: cityLoading, error: cityError, retry: () => { cityRetries += 1; } };
  let categoryRetries = 0, cityRetries = 0;
  const requests = [], navigations = [];
  const classifiedsApi = { list: (body) => { const d = deferred(); d.body = body; requests.push(d); return d.promise; } };
  const router = { push: (href) => navigations.push(href), replace: (href) => navigations.push(href) };
  let source = readSource('apps/frontend/app/classifieds/page.tsx')
    .replace('export default function ClassifiedsPage()', 'function ClassifiedsPage()');
  source += '\nexport default ClassifiedsContent;';
  const h = clientPage(source, {
    'next/link': { default: 'Link' },
    'next/navigation': { useRouter: () => router, useSearchParams: () => params },
    '../../lib/classifieds-client': { classifiedsApi },
    '../../lib/classifieds': { CLASSIFIEDS_ENABLED: true, AD_KIND_LABELS: { sale: 'للبيع', service: 'خدمة', wanted: 'مطلوب', rent: 'للإيجار' }, formatAdPrice: () => 'بدون سعر محدد' },
    '../../lib/use-categories': { useCategories: () => categories },
    '../../lib/use-syrian-cities': { useSyrianCities: () => cities, canonicalCityCode: (v, c) => c.some((i) => i.code === v) ? v : undefined, cityLabel: (v, c) => c.find((i) => i.code === v)?.nameAr ?? v },
    '../components/category-select-options': { CategorySelectOptions: 'CategorySelectOptions' },
    '../components/ui-primitives': primitives,
    '../components/platform-icon': { PlatformIcon: 'PlatformIcon' },
    './classifieds.module.css': { default: css }
  }, { window: { location: { href: 'https://example.test/classifieds' } } });

  function navigate(href) { const [, q = ''] = href.split('?'); params = new URLSearchParams(q); h.render(); }
  return {
    h, requests, navigations, navigate,
    edit(field, value) { const input = field === 'q' ? h.find((n) => n.props?.name === 'q') : h.find((n) => n.props?.name === field); input.props.onChange({ target: { value } }); h.render(); },
    submit() { const before = navigations.length; h.submit(); if (navigations.length > before) navigate(navigations.at(-1)); },
    async resolve(index, ads = [ad()]) { requests[index].resolve({ ads }); await h.flush(); },
    async reject(index) { requests[index].reject(new Error('offline')); await h.flush(); },
    metadata(type, patch) { if (type === 'city') cities = { ...cities, ...patch }; else categories = { ...categories, ...patch }; h.render(); },
    get categoryRetries() { return categoryRetries; }, get cityRetries() { return cityRetries; }
  };
}

test('classifieds filter submission stays on /classifieds and preserves canonical filters', async () => {
  const f = fixture(); await f.resolve(0); f.edit('q', '  سيارة  '); f.edit('categoryCode', 'shopping'); f.edit('cityCode', 'damascus'); f.submit();
  const [path, query] = f.navigations.at(-1).split('?'); assert.equal(path, '/classifieds'); const params = new URLSearchParams(query);
  assert.equal(params.get('q'), 'سيارة'); assert.equal(params.get('categoryCode'), 'shopping'); assert.equal(params.get('cityCode'), 'damascus');
  assert.equal(f.requests.at(-1).body.q, 'سيارة');
});

test('classifieds Back/Forward state drives fields and matching API query', async () => {
  const f = fixture({ query: 'q=old&cityCode=damascus' }); await f.resolve(0); f.navigate('/classifieds?q=new&cityCode=aleppo');
  assert.equal(f.h.find((n) => n.props?.name === 'q').props.value, 'new'); assert.equal(f.requests.at(-1).body.cityCode, 'aleppo');
});

test('late classifieds response cannot replace a newer query', async () => {
  const f = fixture(); f.edit('q', 'جديد'); f.submit(); await f.resolve(1, [ad('الجديد')]); await f.resolve(0, [ad('القديم')]);
  assert.match(f.h.text, /الجديد/); assert.doesNotMatch(f.h.text, /القديم/);
});

test('classifieds failure hides stale ads and exposes retry', async () => {
  const f = fixture(); await f.resolve(0, [ad('قديم')]); f.edit('q', 'جديد'); f.submit(); await f.reject(1);
  assert.doesNotMatch(f.h.text, /قديم/); assert.equal(f.h.find((n) => n.type === 'EmptyState'), undefined);
  f.h.click('إعادة تحميل الإعلانات'); assert.equal(f.requests[2].body.q, 'جديد');
});

test('selected classifieds city waits for registry and never silently broadens', () => {
  const f = fixture({ query: 'cityCode=damascus', cityLoading: true }); assert.equal(f.requests.length, 0); f.metadata('city', { isLoading: false });
  assert.equal(f.requests.length, 1); assert.equal(f.requests[0].body.cityCode, 'damascus');
});

test('unknown classifieds metadata filter is rejected before API query', () => {
  const f = fixture({ query: 'categoryCode=missing' }); assert.equal(f.requests.length, 0); assert.ok(f.h.find((n) => n.type === 'StatusMessage' && n.props.tone === 'danger'));
});

test('classifieds detail links encode identifiers and never point into Store', async () => {
  const f = fixture(); await f.resolve(0, [ad('إعلان', 'a/b?x#y')]);
  assert.ok(f.h.find((n) => n.type === 'ActionLink' && n.props.href === '/classifieds/a%2Fb%3Fx%23y'));
  assert.equal(f.h.find((n) => String(n.props?.href ?? '').startsWith('/store/')), undefined);
});

test('unmounted classifieds request cannot update page state', async () => {
  const f = fixture(); f.h.unmount(); await f.resolve(0); assert.equal(f.h.writesAfterUnmount, 0);
});
