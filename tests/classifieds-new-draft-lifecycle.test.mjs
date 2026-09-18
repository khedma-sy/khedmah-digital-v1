import assert from 'node:assert/strict';
import test from 'node:test';
import { clientPage, css, deferred, primitives, readSource } from './helpers/client-page-harness.mjs';

const draftAd = (patch = {}) => ({
  id: 'ad-1', businessProfileId: 'business-1', kind: 'sale', titleAr: 'إعلان تجريبي', descriptionAr: '',
  categoryCode: 'cars', priceMode: 'none', cityCode: '', areaText: '', contactMode: 'profile', status: 'draft',
  imageUrls: [], createdAt: '2026-09-15T00:00:00Z', updatedAt: '2026-09-15T00:00:00Z',
  revision: 1, contentRevision: 1, reviewRevision: 0, ...patch
});

function fixture({ quota = { used: 0, limit: 3 } } = {}) {
  const calls = { creates: [], updates: [], uploads: [], submits: [] };
  const navigations = [];
  const storage = new Map();
  let sequence = 0;
  const router = { push: (value) => navigations.push(value), replace: (value) => navigations.push(value) };
  const call = (kind, input) => {
    const pending = { ...deferred(), input };
    calls[kind].push(pending);
    return pending.promise;
  };
  const classifiedsApi = {
    quota: async () => quota,
    create: (input) => call('creates', input),
    update: (id, input) => call('updates', { id, ...input }),
    uploadImage: (id, input) => call('uploads', { id, ...input }),
    submit: (id, input) => call('submits', { id, ...input }),
    listImages: async () => ({ images: [] }),
    getMine: async () => ({ ad: draftAd() })
  };
  const requestId = (key) => {
    const existing = storage.get(key);
    if (existing) return existing;
    const created = `classifieds-request-${++sequence}-0000`;
    storage.set(key, created);
    return created;
  };
  const clearRequestId = (key) => storage.delete(key);
  const page = clientPage(readSource('apps/frontend/app/classifieds/new/page.tsx'), {
    'next/navigation': { useRouter: () => router },
    '../../../lib/api-client': { api: { businesses: { listMine: async () => ({ businesses: [{ id: 'business-1', name: 'نشاطي' }] }) } } },
    '../../../lib/classifieds-client': { CLASSIFIEDS_MAX_IMAGES: 5, classifiedsApi },
    '../../../lib/classifieds': { CLASSIFIEDS_ENABLED: true, requestId, clearRequestId },
    '../../../lib/use-categories': { useCategories: () => ({ categories: [], isLoading: false, error: '' }) },
    '../../../lib/use-syrian-cities': { useSyrianCities: () => ({ cities: [], isLoading: false, error: '' }) },
    '../../components/category-select-options': { CategorySelectOptions: 'CategorySelectOptions' },
    '../../components/ui-primitives': primitives,
    '../classifieds.module.css': { default: css }
  }, { FileReader: class {} });
  const imageInput = { files: [], value: '' };
  const form = { elements: { namedItem: () => imageInput } };
  const submit = (intent) => {
    const node = page.find((item) => item.props?.as === 'form');
    node.props.onSubmit({ preventDefault() {}, nativeEvent: { submitter: { value: intent } }, currentTarget: form });
    page.render();
  };
  const fill = () => {
    page.edit('businessProfileId', 'business-1');
    page.edit('titleAr', 'إعلان تجريبي');
    page.edit('categoryCode', 'cars');
  };
  return {
    page, calls, navigations, storage, imageInput, submit, fill,
    async ready() { await page.flush(); fill(); },
    async settle(item, value) { item.resolve(value); await page.flush(); },
    async reject(item, value = new Error('response lost')) { item.reject(value); await page.flush(); }
  };
}

test('Save Draft is separate from review and the saved draft can then be submitted', async () => {
  const f = fixture();
  await f.ready();
  f.submit('draft');
  assert.equal(f.calls.creates.length, 1);
  assert.equal(f.calls.submits.length, 0);
  await f.settle(f.calls.creates[0], { ad: draftAd() });
  assert.match(f.page.text, /تم حفظ المسودة/);
  assert.equal(f.calls.submits.length, 0, 'saving a draft must not consume a publication slot');

  f.submit('review');
  assert.equal(f.calls.updates.length, 1);
  await f.settle(f.calls.updates[0], { ad: draftAd({ revision: 2, contentRevision: 2 }) });
  assert.equal(f.calls.submits.length, 1);
  assert.equal(f.calls.submits[0].input.expectedContentRevision, 2);
  assert.match(f.calls.submits[0].input.clientRequestId, /^classifieds-request-/);
  await f.settle(f.calls.submits[0], { ad: draftAd({ status: 'pending_review', revision: 3, contentRevision: 2, reviewRevision: 1 }) });
  assert.deepEqual(f.navigations, ['/classifieds/manage']);
});

test('creation retries reuse an unacknowledged key and a new ad gets a fresh key after draft success', async () => {
  const f = fixture();
  await f.ready();
  f.submit('draft');
  const firstKey = f.calls.creates[0].input.clientRequestId;
  await f.reject(f.calls.creates[0]);
  f.submit('draft');
  assert.equal(f.calls.creates[1].input.clientRequestId, firstKey);
  await f.settle(f.calls.creates[1], { ad: draftAd() });

  f.page.click('بدء إعلان جديد');
  f.fill();
  f.submit('draft');
  assert.notEqual(f.calls.creates[2].input.clientRequestId, firstKey);
});

test('the new-ad UI rejects a sixth image and still permits draft saving when review quota is full', async () => {
  const full = fixture({ quota: { used: 3, limit: 3 } });
  await full.ready();
  const reviewButton = full.page.find((node) => node.type === 'ActionButton' && node.props.value === 'review');
  assert.equal(reviewButton.props.disabled, true);

  full.imageInput.files = Array.from({ length: 6 }, (_, index) => ({
    name: `image-${index}.png`, type: 'image/png', size: 8, lastModified: index
  }));
  full.submit('draft');
  assert.equal(full.calls.creates.length, 0);
  assert.match(full.page.text, /5 صور كحد أقصى/);

  full.imageInput.files = [];
  full.submit('draft');
  assert.equal(full.calls.creates.length, 1, 'full review quota must not block saving a draft');
});
