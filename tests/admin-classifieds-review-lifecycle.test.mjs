import assert from 'node:assert/strict';
import test from 'node:test';
import { clientPage, deferred, loadSource, readSource } from './helpers/client-page-harness.mjs';

const smartAdmin = {
  version: 'classifieds-smart-admin-v1',
  reviewRevision: 3,
  priority: 'elevated',
  completeness: 'needs_attention',
  humanDecisionRequired: true,
  automatedDecisionAllowed: false,
  signals: [{ code: 'DIRECT_CONTACT', level: 'info', messageAr: 'راجع مطابقة بيانات التواصل للمحتوى.' }],
  summaryAr: 'رُصدت إشارة تتطلب انتباه المشرف قبل اتخاذ القرار.'
};

const ad = {
  id: 'ad/one',
  businessProfileId: 'business-1',
  kind: 'sale',
  titleAr: 'إعلان للمراجعة',
  descriptionAr: 'وصف الإعلان الكامل الذي يجب أن يراه المشرف قبل القرار.',
  categoryCode: 'cars',
  priceMode: 'fixed',
  priceMinor: 250000,
  currency: 'SYP',
  cityCode: 'damascus',
  areaText: 'المزة',
  contactMode: 'phone',
  contactValue: '0999999999',
  status: 'pending_review',
  imageUrls: ['/api/v1/classifieds-media/first', '/api/v1/classifieds-media/second'],
  submittedAt: '2026-09-10T00:00:00Z',
  createdAt: '2026-09-09T00:00:00Z',
  updatedAt: '2026-09-10T00:00:00Z',
  revision: 8,
  contentRevision: 5,
  reviewRevision: 3,
  smartAdmin
};

function fixture({ enabled = true } = {}) {
  const queueLoads = [];
  const decisions = [];
  let pendingCalls = 0;
  const call = (list) => { const d = deferred(); list.push(d); return d.promise; };
  const api = {
    moderation: { listPending: async () => ({ businesses: [], professionals: [] }), listReports: async () => ({ reports: [] }) },
    adminProducts: { pending: async () => ({ products: [] }) },
    businesses: { approveModeration: async () => ({}), rejectModeration: async () => ({}) },
    professionals: { approveModeration: async () => ({}), rejectModeration: async () => ({}) }
  };
  const adminClassifiedsApi = {
    pending() { pendingCalls += 1; return call(queueLoads); },
    review(...args) { const d = call(decisions); decisions.at(-1).args = args; return d.promise; }
  };
  const page = clientPage(readSource('apps/frontend/app/admin/moderation/page.tsx'), {
    '../../../lib/api-client': { api },
    '../../../lib/classifieds-client': { adminClassifiedsApi },
    '../../../lib/classifieds': {
      CLASSIFIEDS_ENABLED: enabled,
      AD_KIND_LABELS: { sale: 'للبيع', service: 'خدمة', wanted: 'مطلوب', rent: 'للإيجار' },
      formatAdPrice: (item) => item.priceMode === 'fixed' ? `${item.priceMinor} ${item.currency}` : 'بدون سعر محدد'
    }
  }, { window: { requestAnimationFrame: fn => fn() }, document: { activeElement: null, addEventListener() {}, removeEventListener() {} }, HTMLElement: class {} });
  return {
    page, queueLoads, decisions,
    get pendingCalls() { return pendingCalls; },
    async resolve(item, value = { ads: [{ ...ad }] }) { item.resolve(value); await page.flush(); },
    async reject(item, value) { item.reject(value); await page.flush(); }
  };
}

test('disabled Classifieds never calls the admin ads queue and keeps moderation usable', async () => {
  const f = fixture({ enabled: false });
  await f.page.flush();
  assert.equal(f.pendingCalls, 0);
  assert.match(f.page.text, /مراجعة إعلانات خدمة معطلة في هذه البيئة/);
  assert.match(f.page.text, /0 بانتظار المراجعة/);
});

test('Classifieds queue failure is isolated from the existing moderation queues', async () => {
  const business = { id: 'business-review', revision: 'rev-1', name: 'نشاط قائم', cityCode: 'damascus', categoryCode: 'repairs', reviewImageUrls: [] };
  const api = {
    moderation: { listPending: async () => ({ businesses: [business], professionals: [] }), listReports: async () => ({ reports: [] }) },
    adminProducts: { pending: async () => ({ products: [] }) },
    businesses: { approveModeration: async () => ({}), rejectModeration: async () => ({}) },
    professionals: { approveModeration: async () => ({}), rejectModeration: async () => ({}) }
  };
  const page = clientPage(readSource('apps/frontend/app/admin/moderation/page.tsx'), {
    '../../../lib/api-client': { api },
    '../../../lib/classifieds-client': { adminClassifiedsApi: { pending: async () => { throw new Error('ads offline'); }, review: async () => ({}) } },
    '../../../lib/classifieds': { CLASSIFIEDS_ENABLED: true, AD_KIND_LABELS: { sale: 'للبيع' }, formatAdPrice: () => '' }
  }, { window: { requestAnimationFrame: fn => fn() }, document: { activeElement: null, addEventListener() {}, removeEventListener() {} }, HTMLElement: class {} });
  await page.flush();
  assert.match(page.text, /نشاط قائم/);
  assert.match(page.text, /ads offline/);
  assert.doesNotMatch(page.text, /^حدث خطأ أثناء تحميل قائمة المراجعة$/);
});

test('Classifieds moderation shows the full review snapshot and Smart Admin assessment without deciding on queue load', async () => {
  const f = fixture();
  assert.equal(f.pendingCalls, 1);
  await f.resolve(f.queueLoads[0]);
  assert.equal(f.decisions.length, 0, 'loading the queue must never auto-approve or auto-reject an ad');
  assert.match(f.page.text, /إعلان للمراجعة/);
  assert.match(f.page.text, /وصف الإعلان الكامل/);
  assert.match(f.page.text, /Smart Admin · أولوية مرتفعة للمراجعة/);
  assert.match(f.page.text, /رُصدت إشارة تتطلب انتباه المشرف/);
  assert.match(f.page.text, /راجع مطابقة بيانات التواصل للمحتوى/);
  assert.match(f.page.text, /القرار النهائي بشري ومسجل/);
  assert.ok(f.page.find(n => n.type === 'a' && n.props.href === '/api/v1/classifieds-media/first'));
  assert.ok(f.page.find(n => n.type === 'a' && n.props.href === '/api/v1/classifieds-media/second'));
});

test('approval sends the displayed review revision and is single-flight', async () => {
  const f = fixture(); await f.resolve(f.queueLoads[0]);
  f.page.click('نشر الإعلان');
  const confirm = f.page.find(n => n.type === 'button' && n.props.children === 'تأكيد القرار');
  confirm.props.onClick(); confirm.props.onClick();
  assert.equal(f.decisions.length, 1);
  assert.deepEqual(f.decisions[0].args, ['ad/one', 'approved', 3, undefined]);
  await f.resolve(f.decisions[0], { ad });
  assert.equal(f.pendingCalls, 2, 'successful decision refreshes the queue once');
});

test('rejection requires a human note and sends it with the displayed review revision', async () => {
  const f = fixture(); await f.resolve(f.queueLoads[0]);
  f.page.click('رفض الإعلان');
  const confirm = f.page.find(n => n.type === 'button' && n.props.children === 'تأكيد القرار');
  assert.equal(confirm.props.disabled, true);
  const textarea = f.page.find(n => n.type === 'textarea');
  textarea.props.onChange({ target: { value: 'سبب مراجعة واضح' } });
  f.page.render();
  f.page.click('تأكيد القرار');
  assert.deepEqual(f.decisions[0].args, ['ad/one', 'rejected', 3, 'سبب مراجعة واضح']);
});

test('stale Smart Admin assessment locks moderation decisions until queue refresh', async () => {
  const f = fixture();
  await f.resolve(f.queueLoads[0], { ads: [{ ...ad, smartAdmin: { ...smartAdmin, reviewRevision: 2 } }] });
  assert.match(f.page.text, /تقييم Smart Admin لا يطابق نسخة المراجعة الحالية/);
  const approve = f.page.find(n => n.type === 'button' && n.props.children === 'نشر الإعلان');
  const reject = f.page.find(n => n.type === 'button' && n.props.children === 'رفض الإعلان');
  assert.equal(approve.props.disabled, true);
  assert.equal(reject.props.disabled, true);
  assert.equal(f.decisions.length, 0);
});

test('409 closes the ad decision, refreshes its snapshot, and requires a new explicit decision', async () => {
  let pendingCalls = 0;
  const decisions = [];
  const api = {
    moderation: { listPending: async () => ({ businesses: [], professionals: [] }), listReports: async () => ({ reports: [] }) },
    adminProducts: { pending: async () => ({ products: [] }) },
    businesses: { approveModeration: async () => ({}), rejectModeration: async () => ({}) },
    professionals: { approveModeration: async () => ({}), rejectModeration: async () => ({}) }
  };
  const page = clientPage(readSource('apps/frontend/app/admin/moderation/page.tsx'), {
    '../../../lib/api-client': { api },
    '../../../lib/classifieds-client': { adminClassifiedsApi: {
      pending: async () => ({ ads: [{ ...ad, reviewRevision: ++pendingCalls + 2, smartAdmin: { ...smartAdmin, reviewRevision: pendingCalls + 2 }, titleAr: pendingCalls === 1 ? ad.titleAr : 'نسخة أحدث' }] }),
      review: async (...args) => { decisions.push(args); throw Object.assign(new Error('changed'), { statusCode: 409 }); }
    } },
    '../../../lib/classifieds': { CLASSIFIEDS_ENABLED: true, AD_KIND_LABELS: { sale: 'للبيع' }, formatAdPrice: () => '250000 SYP' }
  }, { window: { requestAnimationFrame: fn => fn() }, document: { activeElement: null, addEventListener() {}, removeEventListener() {} }, HTMLElement: class {} });
  await page.flush();
  page.click('نشر الإعلان'); page.click('تأكيد القرار'); await page.flush();
  assert.equal(pendingCalls, 2);
  assert.equal(page.find(n => n.props?.role === 'dialog'), undefined);
  assert.match(page.text, /تغير الإعلان أو صوره/);
  assert.match(page.text, /نسخة أحدث/);
  assert.equal(decisions.length, 1, 'refresh must not replay the old moderation decision');
});

test('Classifieds admin client serializes review revision and rejection reason and preserves conflicts', async () => {
  const calls = [];
  const { adminClassifiedsApi } = loadSource(readSource('apps/frontend/lib/classifieds-client.ts'), {}, {
    fetch: async (url, init) => {
      calls.push({ url, init });
      if (calls.length === 2) return { ok: false, status: 409, json: async () => ({ message: 'changed', code: 'AD_REVIEW_CONFLICT' }) };
      return { ok: true, status: 200, json: async () => ({ ad }) };
    }
  });
  await adminClassifiedsApi.review('ad/one', 'approved', 3);
  assert.equal(calls[0].url, '/api/v1/admin/classifieds/ad%2Fone/moderation');
  assert.deepEqual(JSON.parse(calls[0].init.body), { decision: 'approved', expectedReviewRevision: 3 });
  await assert.rejects(() => adminClassifiedsApi.review('ad/one', 'rejected', 4, 'سبب واضح'), cause => cause.statusCode === 409 && cause.code === 'AD_REVIEW_CONFLICT');
  assert.deepEqual(JSON.parse(calls[1].init.body), { decision: 'rejected', expectedReviewRevision: 4, reason: 'سبب واضح' });
});
