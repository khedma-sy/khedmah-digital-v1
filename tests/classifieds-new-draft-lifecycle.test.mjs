import assert from 'node:assert/strict';
import test from 'node:test';
import { clientPage, css, deferred, primitives, readSource } from './helpers/client-page-harness.mjs';

const draftAd = (patch = {}) => ({
  id: 'ad-1', businessProfileId: 'business-1', kind: 'sale', titleAr: 'إعلان تجريبي', descriptionAr: '',
  categoryCode: 'cars', priceMode: 'none', cityCode: '', areaText: '', contactMode: 'profile', status: 'draft',
  imageUrls: [], createdAt: '2026-09-15T00:00:00Z', updatedAt: '2026-09-15T00:00:00Z',
  revision: 1, contentRevision: 1, reviewRevision: 0, ...patch
});

function fixture({ quota = { used: 0, limit: 3 }, editor = false, ad = draftAd() } = {}) {
  const calls = { creates: [], updates: [], uploads: [], submits: [], getMine: [], listImages: [] };
  const navigations = [];
  const storage = new Map();
  let sequence = 0;
  let currentAd = ad;
  let storedImages = [];
  let readFailure;
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
    listImages: async (id) => {
      calls.listImages.push(id);
      if (readFailure) throw readFailure;
      return { images: storedImages };
    },
    getMine: async (id) => {
      calls.getMine.push(id);
      if (readFailure) throw readFailure;
      return { ad: currentAd };
    }
  };
  const requestId = (key) => {
    const existing = storage.get(key);
    if (existing) return existing;
    const created = `classifieds-request-${++sequence}-0000`;
    storage.set(key, created);
    return created;
  };
  const clearRequestId = (key) => storage.delete(key);
  const lib = editor ? '../../../../../lib/' : '../../../lib/';
  const components = editor ? '../../../../components/' : '../../components/';
  const page = clientPage(readSource(`apps/frontend/app/classifieds/${editor ? 'manage/[id]/edit' : 'new'}/page.tsx`), {
    'next/navigation': { useRouter: () => router, useParams: () => ({ id: ad.id }) },
    [`${lib}api-client`]: { api: { businesses: { listMine: async () => ({ businesses: [{ id: 'business-1', name: 'نشاطي' }] }) } } },
    [`${lib}classifieds-client`]: { CLASSIFIEDS_MAX_IMAGES: 5, classifiedsApi },
    [`${lib}classifieds`]: { CLASSIFIEDS_ENABLED: true, requestId, clearRequestId, AD_STATUS_LABELS: { draft: 'مسودة', pending_review: 'قيد المراجعة' } },
    [`${lib}use-categories`]: { useCategories: () => ({ categories: [], isLoading: false, error: '' }) },
    [`${lib}use-syrian-cities`]: { useSyrianCities: () => ({ cities: [], isLoading: false, error: '' }) },
    [`${components}category-select-options`]: { CategorySelectOptions: 'CategorySelectOptions' },
    [`${components}ui-primitives`]: primitives,
    [editor ? '../../../classifieds.module.css' : '../classifieds.module.css']: { default: css }
  }, { FileReader: class {
    readAsDataURL(file) { this.result = `data:${file.type};base64,aW1hZ2U=`; this.onload(); }
  } });
  const imageInput = { files: [], set value(value) { assert.equal(value, ''); this.files = []; } };
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
    failReads() { readFailure = new Error('reconciliation unavailable'); },
    async ready() { await page.flush(); if (!editor) fill(); },
    async settle(item, value) {
      if (value.ad) currentAd = value.ad;
      if (value.image) {
        storedImages = [...storedImages, value.image];
        currentAd = { ...currentAd, revision: value.adRevision, contentRevision: value.contentRevision };
      }
      item.resolve(value); await page.flush();
    },
    async reject(item, value = new Error('response lost')) { item.reject(value); await page.flush(); }
  };
}

const errorText = (page) => {
  const message = page.find((node) => node.type === 'StatusMessage' && node.props.tone === 'danger');
  assert.ok(message, 'the primary error remains visible');
  return Array.isArray(message.props.children) ? message.props.children[0] : message.props.children;
};
const generic429 = (code = 'request_error') => Object.assign(new Error('تعذر إكمال الطلب.'), { statusCode: 429, ...(code && { code }) });
const quotaError = () => Object.assign(new Error('legacy quota error'), { statusCode: 429, code: 'AD_FREE_QUOTA_EXHAUSTED' });
const quotaMessage = 'تم استهلاك الحصة الحالية: ثلاثة إعلانات مجانية للحساب.';

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
  full.submit('review');
  assert.equal(full.calls.creates.length, 0, 'the confirmed quota response also guards the submit handler');
  assert.match(errorText(full.page), /تم استهلاك الحصة الحالية/);

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

for (const code of ['request_error', null]) {
  test(`a generic create 429 (${code ?? 'no code'}) preserves the form and unacknowledged key without claiming a draft`, async () => {
    const f = fixture();
    await f.ready();
    f.page.edit('descriptionAr', 'تفاصيل باقية في النموذج');
    f.submit('review');
    const attempt = f.calls.creates[0];
    f.submit('review');
    assert.equal(f.calls.creates.length, 1, 'a pending create stays single-flight');
    await f.reject(attempt, generic429(code));

    assert.equal(f.storage.get('khedmah.classifieds.create'), attempt.input.clientRequestId);
    for (const name of ['businessProfileId', 'titleAr', 'categoryCode', 'descriptionAr']) {
      assert.equal(f.page.find((node) => node.props.name === name).props.value, attempt.input[name]);
    }
    assert.equal(f.page.find((node) => node.props.as === 'form').props['aria-busy'], false);
    assert.equal(f.calls.creates.length, 1, 'an error must not automatically retry creation');
    for (const kind of ['updates', 'uploads', 'submits', 'getMine', 'listImages']) assert.equal(f.calls[kind].length, 0, kind);
    assert.deepEqual(f.navigations, []);
    assert.equal(errorText(f.page), 'تعذر إكمال الطلب.');
    assert.doesNotMatch(f.page.text, /هذه المسودة محفوظة|المسودة محفوظة ولن تُكرر/);

    f.submit('draft');
    assert.equal(f.calls.creates.length, 2);
    assert.deepEqual(f.calls.creates[1].input, attempt.input, 'an explicit retry reuses the same creation key and form payload');
    await f.settle(f.calls.creates[1], { ad: draftAd() });
    assert.equal(f.storage.has('khedmah.classifieds.create'), false, 'only acknowledgement clears the create key');
  });
}

test('an explicit quota code before creation acknowledgement does not claim that the draft was saved', async () => {
  const f = fixture();
  await f.ready();
  f.submit('review');
  const attempt = f.calls.creates[0];
  await f.reject(attempt, quotaError());

  assert.equal(errorText(f.page), quotaMessage);
  assert.doesNotMatch(f.page.text, /هذه المسودة محفوظة|المسودة محفوظة ولن تُكرر/);
  assert.equal(f.storage.get('khedmah.classifieds.create'), attempt.input.clientRequestId);
  assert.equal(f.calls.creates.length, 1);
  for (const kind of ['updates', 'uploads', 'submits', 'getMine', 'listImages']) assert.equal(f.calls[kind].length, 0, kind);
  assert.deepEqual(f.navigations, []);
});

for (const scenario of [
  { label: 'generic 429 with successful reconciliation', issue: generic429, readFailure: false, message: 'تعذر إكمال الطلب.' },
  { label: 'generic 429 with failed reconciliation', issue: generic429, readFailure: true, message: 'تعذر إكمال الطلب.' },
  { label: 'explicit quota error', issue: quotaError, readFailure: false, message: quotaMessage }
]) {
  test(`a confirmed draft and image remain acknowledged after a submit ${scenario.label}`, async () => {
    const f = fixture();
    await f.ready();
    f.imageInput.files = [{ name: 'saved.png', type: 'image/png', size: 5, lastModified: 7 }];
    f.submit('review');
    assert.equal(f.imageInput.files.length, 0, 'clearing the file control consumes the current selection');
    await f.settle(f.calls.creates[0], { ad: draftAd({ revision: 6, contentRevision: 6 }) });
    assert.equal(f.calls.uploads.length, 1);
    const image = { id: 'image-1', publicUrl: '/media/ad-image-1', sortOrder: 0 };
    await f.settle(f.calls.uploads[0], { image, adRevision: 7, contentRevision: 7 });
    assert.equal(f.calls.submits.length, 1);
    const attempt = f.calls.submits[0];
    assert.equal(attempt.input.id, 'ad-1');
    assert.equal(attempt.input.expectedContentRevision, 7);
    if (scenario.readFailure) f.failReads();
    await f.reject(attempt, scenario.issue());

    assert.equal(errorText(f.page), scenario.message, 'reconciliation must preserve the primary decoded error');
    assert.match(f.page.text, /هذه المسودة محفوظة؛ يمكنك إرسالها للمراجعة أو بدء إعلان آخر/);
    assert.match(f.page.text, /الصور المحفوظة: 1 من 5/);
    assert.deepEqual(f.calls.getMine, ['ad-1']);
    assert.deepEqual(f.calls.listImages, ['ad-1', 'ad-1'], 'one pre-upload read and one reconciliation read');
    assert.deepEqual([...f.storage], [['khedmah.classifieds.submit.ad-1.7', attempt.input.clientRequestId]], 'acknowledged creation/image keys clear while the failed submit key remains');
    assert.equal(f.calls.creates.length, 1);
    assert.equal(f.calls.uploads.length, 1);
    assert.equal(f.calls.submits.length, 1, 'neither reconciliation outcome may automatically repeat a write');
    assert.equal(f.calls.updates.length, 0);
    assert.deepEqual(f.navigations, []);
    assert.equal(f.page.find((node) => node.props.as === 'form').props['aria-busy'], false);
  });
}

for (const code of ['request_error', null, 'AD_FREE_QUOTA_EXHAUSTED']) {
  test(`the editor retains its failed submit key and revision for explicit retry (${code ?? 'no code'})`, async () => {
    const ad = draftAd({ revision: 9, contentRevision: 7 });
    const f = fixture({ editor: true, ad });
    await f.ready();
    f.page.click('إرسال للمراجعة');
    const attempt = f.calls.submits[0];
    await f.reject(attempt, code === 'AD_FREE_QUOTA_EXHAUSTED' ? quotaError() : generic429(code));

    assert.equal(errorText(f.page), code === 'AD_FREE_QUOTA_EXHAUSTED' ? quotaMessage : 'تعذر إكمال الطلب.');
    assert.equal(attempt.input.id, ad.id);
    assert.equal(attempt.input.expectedContentRevision, ad.contentRevision);
    assert.deepEqual([...f.storage], [['khedmah.classifieds.submit.ad-1.7', attempt.input.clientRequestId]]);
    assert.equal(f.calls.submits.length, 1, 'no automatic write retry');
    for (const kind of ['creates', 'updates', 'uploads']) assert.equal(f.calls[kind].length, 0, kind);
    assert.deepEqual(f.calls.getMine, ['ad-1']);
    assert.deepEqual(f.calls.listImages, ['ad-1']);
    assert.deepEqual(f.navigations, []);

    f.page.click('إرسال للمراجعة');
    assert.equal(f.calls.submits.length, 2);
    assert.deepEqual(f.calls.submits[1].input, attempt.input, 'the unchanged draft retries with its original key and content revision');
    await f.settle(f.calls.submits[1], { ad: draftAd({ status: 'pending_review', revision: 10, contentRevision: 7, reviewRevision: 1 }) });
    assert.equal(f.storage.size, 0, 'the submit key clears only after acknowledgement');
    assert.match(f.page.text, /تم إرسال الإعلان للمراجعة/);
    assert.match(f.page.text, /الإعلان وصوره مقفلة أثناء المراجعة/);
    assert.deepEqual(f.navigations, []);
  });
}
